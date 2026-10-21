import { Router, Request, Response } from "express";
import { extractEquipmentName, identifyEquipment } from "../services/equipmentAiService";
import { getEquipmentVideos } from "../services/youtubeService";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const header = req.header("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user.id;
}

// ─── String-similarity helpers ────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1.0;
  // Substring containment gets a high-confidence score
  if (na.includes(nb) || nb.includes(na)) return 0.95;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(na, nb) / maxLen;
}

function findBestMatch(
  quickName: string,
  list: { id: string; name: string }[]
): { match: { id: string; name: string } | null; score: number } {
  let bestScore = 0;
  let bestMatch: { id: string; name: string } | null = null;
  for (const eq of list) {
    const score = nameSimilarity(quickName, eq.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = eq;
    }
  }
  return { match: bestScore >= 0.9 ? bestMatch : null, score: bestScore };
}

// QA #20: when the primary identification is below the same 0.75 threshold
// the client already uses for its "Strong match"/"Possible match" badge
// (components/Scan/ScanResultSheet.tsx), surface the next-closest known
// equipment by name as swipeable alternates, instead of only ever showing
// one guess. Reuses the existing name-similarity scoring against our own
// equipment table rather than asking the vision model for multiple
// candidates — keeps this self-contained and doesn't touch the
// identification prompt/schema other callers rely on.
function findAlternates(
  primaryName: string,
  excludeId: string | undefined,
  list: { id: string; name: string }[],
  max: number
): Array<{ id: string; name: string; confidence: number }> {
  return list
    .filter((eq) => eq.id !== excludeId)
    .map((eq) => ({ id: eq.id, name: eq.name, confidence: nameSimilarity(primaryName, eq.name) }))
    .filter((eq) => eq.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, max);
}

// ─── Cache-hit identification tracking ───────────────────────────────────────

async function upsertIdentificationRecord(
  equipmentId: string,
  equipmentName: string,
  rawAiResponse: object | null,
  userId?: string | null
): Promise<string | null> {
  const now = new Date().toISOString();

  // Global aggregate: one record per equipment (no user)
  const { data: existing } = await supabase
    .from("equipment_identifications")
    .select("id, scan_count")
    .eq("equipment_id", equipmentId)
    .is("user_id", null)
    .maybeSingle();

  let identificationId: string | null = null;

  if (existing) {
    const { data: updated } = await supabase
      .from("equipment_identifications")
      .update({
        scan_count: existing.scan_count + 1,
        last_scanned_at: now,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    identificationId = updated?.id ?? null;
  } else {
    const { data: inserted, error } = await supabase
      .from("equipment_identifications")
      .insert({
        equipment_id: equipmentId,
        equipment_name: equipmentName,
        scan_count: 1,
        first_scanned_at: now,
        last_scanned_at: now,
        raw_ai_response: rawAiResponse,
      })
      .select("id")
      .single();
    if (error) console.error("[identify] identification insert error:", error.message);
    identificationId = inserted?.id ?? null;
  }

  // Per-user tracking is best-effort because older production schemas have a
  // unique equipment_id constraint that prevents one row per user/equipment.
  if (userId) {
    const { error: userErr } = await supabase
      .from("equipment_identifications")
      .insert({
        equipment_id: equipmentId,
        equipment_name: equipmentName,
        user_id: userId,
        scan_count: 1,
        first_scanned_at: now,
        last_scanned_at: now,
      });
    if (userErr?.code === "23505") {
      console.log("[identify] user scan already tracked for:", equipmentName);
    } else if (userErr) {
      console.error("[identify] user scan insert error:", userErr.message);
    } else {
      console.log(`SAVED TO DB: ${equipmentName}`);
    }
  }

  return identificationId;
}

// ─── Saving a new identification ─────────────────────────────────────────────
//
// Production's equipment table has no unique constraint on name, and
// equipment_videos none on youtube_id (supabase/schema.sql declares them, but
// they never reached production). The old `.upsert(..., { onConflict })`
// therefore failed on every new machine with "there is no unique or
// exclusion constraint matching the ON CONFLICT specification" — the
// "I identified the equipment but couldn't save it" bug. Look up first, then
// update or insert, so saving works whatever constraints exist.

type Identification = Awaited<ReturnType<typeof identifyEquipment>>;
type EquipmentVideo = Awaited<ReturnType<typeof getEquipmentVideos>>[number];

async function saveIdentifiedEquipment(
  identification: NonNullable<Identification>,
  allEquipment: { id: string; name: string }[]
): Promise<{ id: string } | null> {
  const fields = {
    name: identification.name,
    name_es: identification.name_es,
    category: identification.category,
    description: identification.description,
    description_es: identification.description_es,
    muscle_groups: identification.muscle_groups,
    difficulty: identification.difficulty,
    tutorial_steps: identification.tutorial_steps,
    safety_tips: identification.safety_tips,
    safety_tips_es: identification.safety_tips_es,
  };
  const existing = allEquipment.find((eq) => normalizeStr(eq.name) === normalizeStr(identification.name));
  const query = existing
    ? supabase.from("equipment").update(fields).eq("id", existing.id)
    : supabase.from("equipment").insert(fields);
  const { data, error } = await query.select("id").single();
  if (error || !data) {
    console.error("[identify] equipment save error:", error?.message);
    return null;
  }
  return data;
}

async function saveEquipmentVideos(equipmentId: string, videos: EquipmentVideo[]) {
  if (videos.length === 0) return;
  const { data: existing } = await supabase
    .from("equipment_videos")
    .select("youtube_id")
    .in("youtube_id", videos.map((v) => v.youtube_id));
  const known = new Set((existing ?? []).map((row) => row.youtube_id));
  const fresh = videos.filter((v) => !known.has(v.youtube_id));
  if (fresh.length === 0) return;
  const { error } = await supabase.from("equipment_videos").insert(
    fresh.map((v) => ({
      equipment_id: equipmentId,
      youtube_id: v.youtube_id,
      title: v.title,
      thumbnail_url: v.thumbnail_url,
      duration: v.duration,
    }))
  );
  if (error) console.error("[identify] video insert error:", error.message);
}

// An identification whose save failed, kept briefly so the app can retry
// just the save (POST /save) instead of making the person retake the photo.
// In memory on purpose: it's a short retry window, and it means the client
// never sends equipment data that would be written to the shared catalog.
const PENDING_SAVE_TTL_MS = 30 * 60 * 1000;
const pendingSaves = new Map<
  string,
  { identification: NonNullable<Identification>; videos: EquipmentVideo[]; userId: string | null; expiresAt: number }
>();

function rememberPendingSave(identification: NonNullable<Identification>, videos: EquipmentVideo[], userId: string | null) {
  const now = Date.now();
  for (const [key, entry] of pendingSaves) if (entry.expiresAt < now) pendingSaves.delete(key);
  const token = randomUUID();
  pendingSaves.set(token, { identification, videos, userId, expiresAt: now + PENDING_SAVE_TTL_MS });
  return token;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    const userId = await getAuthenticatedUserId(req);
    console.log("[identify] POST received — userId:", userId, "| image length:", image?.length ?? 0);

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    // ── Step 1: Quick name extraction (low-detail OpenAI vision) ───────────
    const quickName = await extractEquipmentName(image);
    console.log("[identify] quick name extracted:", quickName);

    // ── Step 2: Load all equipment names from Supabase ─────────────────────
    const { data: allEquipment, error: listError } = await supabase
      .from("equipment")
      .select("id, name");

    if (listError) console.error("[identify] equipment list error:", listError.message);

    const { match, score } = findBestMatch(quickName, allEquipment ?? []);
    console.log("[identify] best match:", match?.name ?? "none", "| score:", score.toFixed(3));

    // ── Step 3a: CACHE HIT — return from Supabase ──────────────────────────
    if (match) {
      console.log(`CACHE HIT - saved API call for: ${match.name}`);

      const { data: cached, error: fetchError } = await supabase
        .from("equipment")
        .select("*")
        .eq("id", match.id)
        .single();

      if (fetchError || !cached) {
        console.error("[identify] failed to fetch cached equipment:", fetchError?.message);
        // Fall through to full API call if fetch fails
      } else {
        // Get videos from DB (no YouTube API call needed)
        const { data: dbVideos } = await supabase
          .from("equipment_videos")
          .select("youtube_id, title, thumbnail_url, duration, curator_approved")
          .eq("equipment_id", match.id)
          .limit(10);

        const identificationId = await upsertIdentificationRecord(match.id, match.name, null, userId);

        return res.json({
          ...cached,
          confidence: 1.0,
          videos: dbVideos ?? [],
          identification_id: identificationId,
          fromCache: true,
        });
      }
    }

    // ── Step 3b: CACHE MISS — full OpenAI vision call ──────────────────────
    console.log(`NEW SCAN - calling OpenAI for: ${quickName}`);

    const identification = await identifyEquipment(image);
    console.log("[identify] OpenAI full result:", identification?.name);

    if (
      !identification?.name ||
      /unknown|not (gym )?equipment|unable to identify/i.test(identification.name) ||
      identification.confidence < 0.55
    ) {
      return res.status(422).json({
        error: "I couldn't identify that equipment confidently. Try a closer photo with the full machine visible.",
      });
    }

    const videos = await getEquipmentVideos(identification.search_query);

    const equipment = await saveIdentifiedEquipment(identification, allEquipment ?? []);

    if (!equipment) {
      // Newer apps (x-spotlift-save-retry) keep the identified result on
      // screen and retry only the save. Older builds still get the error.
      if (req.header("x-spotlift-save-retry") !== "1") {
        return res.status(502).json({
          error: "I identified the equipment but couldn't save it. Please try again.",
        });
      }
      return res.json({
        ...identification,
        id: null,
        videos,
        identification_id: null,
        fromCache: false,
        alternates: [],
        save_failed: true,
        save_token: rememberPendingSave(identification, videos, userId),
      });
    }

    await saveEquipmentVideos(equipment.id, videos);
    const identificationId = await upsertIdentificationRecord(
      equipment.id,
      identification.name,
      identification as unknown as object,
      userId
    );

    const alternates =
      identification.confidence < 0.75
        ? findAlternates(identification.name, equipment.id, allEquipment ?? [], 2)
        : [];

    console.log(`SAVED TO DB: ${identification?.name}`);
    console.log("[identify] returning new result for:", identification?.name, "| alternates:", alternates.length);
    return res.json({
      ...identification,
      id: equipment.id,
      videos,
      identification_id: identificationId,
      fromCache: false,
      alternates,
    });
  } catch (error: any) {
    console.error("[identify] error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Identification failed" });
  }
});

// Retry just the save for an identification that was already made.
router.post("/save", async (req: Request, res: Response) => {
  try {
    const token = typeof req.body?.save_token === "string" ? req.body.save_token : "";
    const pending = pendingSaves.get(token);
    if (!pending || pending.expiresAt < Date.now()) {
      pendingSaves.delete(token);
      return res.status(410).json({ error: "That scan expired. Please scan the equipment again." });
    }
    const { data: allEquipment } = await supabase.from("equipment").select("id, name");
    const equipment = await saveIdentifiedEquipment(pending.identification, allEquipment ?? []);
    if (!equipment) {
      return res.status(502).json({ error: "Still couldn't save it. Please try again in a moment." });
    }
    pendingSaves.delete(token);
    await saveEquipmentVideos(equipment.id, pending.videos);
    const identificationId = await upsertIdentificationRecord(
      equipment.id,
      pending.identification.name,
      pending.identification as unknown as object,
      pending.userId
    );
    return res.json({ id: equipment.id, identification_id: identificationId });
  } catch (error: any) {
    console.error("[identify] save retry error:", error.message ?? error);
    return res.status(500).json({ error: "Still couldn't save it. Please try again in a moment." });
  }
});

export default router;

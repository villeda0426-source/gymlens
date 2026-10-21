import { Router, Request, Response } from "express";
import { identifyEquipment, observeEquipment } from "../services/equipmentAiService";
import { getEquipmentVideos } from "../services/youtubeService";
import { createSupabaseEquipmentCatalog } from "../services/equipmentCatalogService";
import { normalizeStr, scanEquipment, type ScanDeps } from "../services/equipmentScanService";
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
  // An existing row keeps its content: it may be curated, and one scan's
  // AI output is not a reason to rewrite it.
  const existing = allEquipment.find((eq) => normalizeStr(eq.name) === normalizeStr(identification.name));
  if (existing) return { id: existing.id };
  const { data, error } = await supabase.from("equipment").insert(fields).select("id").single();
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

const scanDeps: ScanDeps = {
  observe: observeEquipment,
  identify: identifyEquipment,
  catalog: createSupabaseEquipmentCatalog(supabase),
  videos: getEquipmentVideos,
  rememberPendingSave,
  legacy: {
    async list() {
      const { data, error } = await supabase.from("equipment").select("id, name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    async fetch(id) {
      const { data, error } = await supabase.from("equipment").select("*").eq("id", id).single();
      if (error) console.error("[identify] failed to fetch cached equipment:", error.message);
      return data ?? null;
    },
    async fetchVideos(id) {
      const { data } = await supabase
        .from("equipment_videos")
        .select("youtube_id, title, thumbnail_url, duration, curator_approved")
        .eq("equipment_id", id)
        .limit(10);
      return data ?? [];
    },
    save: saveIdentifiedEquipment,
    saveVideos: saveEquipmentVideos,
    recordIdentification: upsertIdentificationRecord,
  },
};

router.post("/", async (req: Request, res: Response) => {
  try {
    const { image } = req.body;
    const userId = await getAuthenticatedUserId(req);
    console.log("[identify] POST received — userId:", userId, "| image length:", image?.length ?? 0);

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    const result = await scanEquipment(
      {
        image,
        userId,
        saveRetry: req.header("x-spotlift-save-retry") === "1",
        gymSlug: typeof req.body?.gym_slug === "string" ? req.body.gym_slug : null,
      },
      scanDeps
    );
    return res.status(result.status).json(result.body);
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

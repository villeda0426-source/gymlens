import { Router, Request, Response } from "express";
import { extractEquipmentName, identifyEquipment } from "../services/claudeService";
import { getEquipmentVideos } from "../services/youtubeService";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  // Per-user record: insert a fresh row each scan so the user can see their history
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
    if (userErr) console.error("[identify] user scan insert error:", userErr.message);
    else console.log(`SAVED TO DB: ${equipmentName}`);
  }

  return identificationId;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    const { image, userId } = req.body;
    console.log("[identify] POST received — userId:", userId, "| image length:", image?.length ?? 0);

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    // ── Step 1: Quick name extraction (Haiku — cheap) ──────────────────────
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

    // ── Step 3b: CACHE MISS — full Anthropic call ──────────────────────────
    console.log(`NEW SCAN - calling Anthropic for: ${quickName}`);

    const identification = await identifyEquipment(image);
    console.log("[identify] Claude full result:", identification?.name);

    const videos = await getEquipmentVideos(identification.search_query);

    // Upsert equipment record
    const { data: equipment, error: upsertError } = await supabase
      .from("equipment")
      .upsert(
        {
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
        },
        { onConflict: "name", ignoreDuplicates: false }
      )
      .select()
      .single();

    if (upsertError) console.error("[identify] equipment upsert error:", upsertError.message);

    let identificationId: string | null = null;
    if (equipment) {
      // Save videos
      if (videos.length > 0) {
        const { error: videoError } = await supabase.from("equipment_videos").upsert(
          videos.map((v) => ({
            equipment_id: equipment.id,
            youtube_id: v.youtube_id,
            title: v.title,
            thumbnail_url: v.thumbnail_url,
            duration: v.duration,
          })),
          { onConflict: "youtube_id", ignoreDuplicates: true }
        );
        if (videoError) console.error("[identify] video upsert error:", videoError.message);
      }

      // Save identification record with raw AI response
      identificationId = await upsertIdentificationRecord(
        equipment.id,
        identification.name,
        identification as unknown as object,
        userId
      );
    }

    console.log(`SAVED TO DB: ${identification?.name}`);
    console.log("[identify] returning new result for:", identification?.name);
    return res.json({
      ...identification,
      id: equipment?.id,
      videos,
      identification_id: identificationId,
      fromCache: false,
    });
  } catch (error: any) {
    console.error("[identify] error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Identification failed" });
  }
});

export default router;

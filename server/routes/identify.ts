import { Router, Request, Response } from "express";
import { identifyEquipment } from "../services/claudeService";
import { getEquipmentVideos } from "../services/youtubeService";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post("/", async (req: Request, res: Response) => {
  try {
    const { image, userId } = req.body;
    console.log("[identify] POST received — userId:", userId, "| image length:", image?.length ?? 0);

    if (!image) {
      return res.status(400).json({ error: "Image is required" });
    }

    console.log("[identify] calling Claude...");
    const identification = await identifyEquipment(image);
    console.log("[identify] Claude result:", identification?.name);
    const videos = await getEquipmentVideos(identification.search_query);

    // Upsert equipment record — log errors but never let DB failures kill the response
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

    let identificationRecord = null;
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

      // Save identification record
      const { data: idRecord, error: idError } = await supabase
        .from("equipment_identifications")
        .insert({
          user_id: userId || null,
          equipment_id: equipment.id,
          raw_result: identification,
          confidence: identification.confidence,
        })
        .select()
        .single();
      if (idError) console.error("[identify] identification insert error:", idError.message);
      identificationRecord = idRecord;
    }

    console.log("[identify] returning result for:", identification?.name);
    return res.json({
      ...identification,
      id: equipment?.id,
      videos,
      identification_id: identificationRecord?.id,
    });
  } catch (error: any) {
    console.error("[identify] error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Identification failed" });
  }
});

export default router;

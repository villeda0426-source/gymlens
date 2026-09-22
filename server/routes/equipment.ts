import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { createTextResponse, OPENAI_DEFAULT_MODEL } from "../services/openaiService";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: equipment, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !equipment) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    const { data: videos } = await supabase
      .from("equipment_videos")
      .select("*")
      .eq("equipment_id", id)
      .order("curator_approved", { ascending: false })
      .limit(6);

    return res.json({ ...equipment, videos: videos || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Returns existing weight_factor or asks Claude and saves it
router.get("/:id/weight-factor", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: equipment, error } = await supabase
      .from("equipment")
      .select("id, name, weight_factor")
      .eq("id", id)
      .single();

    if (error || !equipment) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    if (equipment.weight_factor != null) {
      return res.json({ weight_factor: Number(equipment.weight_factor) });
    }

    // Call OpenAI once to get weight factor
    console.log(`[weight-factor] Asking OpenAI for: ${equipment.name}`);
    const raw = await createTextResponse({
      model: OPENAI_DEFAULT_MODEL,
      instructions: "Estimate conservative beginner starting loads for gym exercises. This is educational guidance, not a medical prescription.",
      input: `For the gym exercise ${equipment.name}, what percentage of a person's body weight is a reasonable starting weight for a complete beginner? Reply with ONLY a decimal between 0.05 and 1.5, nothing else.`,
      maxOutputTokens: 16,
      timeoutMs: 10000,
    });
    const parsed = parseFloat(raw);
    const factor = isNaN(parsed) ? 0.3 : Math.min(1.5, Math.max(0.05, parsed));

    await supabase
      .from("equipment")
      .update({ weight_factor: factor })
      .eq("id", id);

    console.log(`[weight-factor] Saved ${factor} for: ${equipment.name}`);
    return res.json({ weight_factor: factor });
  } catch (error: any) {
    console.error("[weight-factor] error:", error.message);
    return res.status(500).json({ error: "Starting-weight guidance is temporarily unavailable." });
  }
});

export default router;

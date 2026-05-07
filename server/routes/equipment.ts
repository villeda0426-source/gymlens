import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

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

    // Get videos — curator-approved first
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

export default router;

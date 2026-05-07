import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.get("/", async (req: Request, res: Response) => {
  try {
    const { q, category } = req.query as { q?: string; category?: string };

    let query = supabase
      .from("equipment")
      .select("id, name, name_es, category, description, description_es, muscle_groups, difficulty, image_url")
      .order("name");

    if (q) {
      query = query.or(`name.ilike.%${q}%,name_es.ilike.%${q}%,description.ilike.%${q}%`);
    }

    if (category && category !== "all") {
      query = query.eq("category", category);
    }

    const { data, error } = await query.limit(50);

    if (error) throw error;

    return res.json(data || []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Search failed" });
  }
});

export default router;

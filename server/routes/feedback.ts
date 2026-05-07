import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post("/", async (req: Request, res: Response) => {
  try {
    const { userId, identificationId, rating, category, message } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({
        user_id: userId || null,
        identification_id: identificationId || null,
        rating,
        category: category || "other",
        message: message || null,
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, id: data.id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

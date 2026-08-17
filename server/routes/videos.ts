import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { searchYouTubeVideos } from "../../lib/youtube";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/videos?equipment_id=<uuid>&name=<string>
// Returns cached videos from Supabase or fetches from YouTube and caches them.
router.get("/", async (req: Request, res: Response) => {
  const { equipment_id, name, language: requestedLanguage } = req.query as { equipment_id?: string; name?: string; language?: string };
  const language = requestedLanguage === "es" ? "es" : "en";

  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  // 1. Return cached videos if they exist
  if (equipment_id) {
    const { data: cached } = await supabase
      .from("equipment_videos")
      .select("*")
      .eq("equipment_id", equipment_id)
      .eq("language", language)
      .order("curator_approved", { ascending: false })
      .limit(5);

    if (cached && cached.length > 0) {
      return res.json(cached);
    }
  }

  // 2. Fetch from YouTube
  const query = language === "es" ? `${name} tutorial gimnasio cómo usar` : `${name} gym tutorial how to use`;
  let videos = await searchYouTubeVideos(query, 5);

  if (videos.length === 0) {
    return res.json([]);
  }

  // 3. Cache in Supabase (best-effort — skip if no equipment_id or insert fails)
  if (equipment_id) {
    const rows = videos.map((v) => ({
      ...v,
      equipment_id,
      language,
      curator_approved: false,
    }));

    // Insert one-by-one so a duplicate youtube_id on one video doesn't block the rest
    const saved: any[] = [];
    for (const row of rows) {
      const { data } = await supabase
        .from("equipment_videos")
        .insert(row)
        .select("*")
        .single();
      if (data) saved.push(data);
    }

    // Return saved rows (with DB ids) when possible, else fall back to raw YouTube results
    if (saved.length > 0) {
      return res.json(saved);
    }
  }

  return res.json(videos);
});

export default router;

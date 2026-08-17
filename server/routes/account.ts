import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const USER_TABLES = [
  "feedback",
  "equipment_identifications",
  "saved_equipment",
  "muscle_progress_history",
  "muscle_progress",
  "completed_exercises",
  "workout_feedback",
  "coach_trainer_jobs",
  "ai_usage_events",
] as const;

router.delete("/", async (req, res) => {
  const authorization = req.header("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  if (!token) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const userId = authData.user?.id;
  if (authError || !userId) {
    res.status(401).json({ error: "Your session is no longer valid. Please sign in again." });
    return;
  }

  try {
    for (const table of USER_TABLES) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`Could not remove ${table}: ${error.message}`);
    }

    const { error: profileError } = await supabase.from("profiles").delete().eq("id", userId);
    if (profileError) throw new Error(`Could not remove profile: ${profileError.message}`);

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    res.json({ deleted: true });
  } catch (error: any) {
    console.error("[account-delete]", error?.message || error);
    res.status(500).json({ error: "We could not delete your account. Please try again or contact support." });
  }
});

export default router;

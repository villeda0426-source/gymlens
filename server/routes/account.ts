import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { sendApiError } from "../lib/apiContract";

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function authenticatedUserId(req: Request): Promise<string | null> {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

// Explicit owner filters are required because this uses a service-role client.
// Coach job payload/result are intentionally excluded: they must never retain
// message text or model response text.
router.get("/export", async (req: Request, res: Response) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return sendApiError(res, 401, "AUTH_REQUIRED", "Sign in again before exporting your data.");
  try {
    const [profile, limitations, consents, programs, planSessions, planExercises, workouts, sets, events, insights] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_limitations").select("*").eq("user_id", userId),
      supabase.from("user_consents").select("*").eq("user_id", userId),
      supabase.from("programs").select("*").eq("user_id", userId),
      supabase.from("plan_sessions").select("*").eq("user_id", userId),
      supabase.from("plan_exercises").select("*").eq("user_id", userId),
      supabase.from("workout_sessions").select("*").eq("user_id", userId),
      supabase.from("set_logs").select("*").eq("user_id", userId),
      supabase.from("coach_events").select("*").eq("user_id", userId),
      supabase.from("user_insights").select("*").eq("user_id", userId),
    ]);
    const failed = [profile, limitations, consents, programs, planSessions, planExercises, workouts, sets, events, insights].find((query) => query.error);
    if (failed?.error) throw failed.error;
    return res.json({
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      limitations: limitations.data ?? [], consents: consents.data ?? [], programs: programs.data ?? [],
      planSessions: planSessions.data ?? [], planExercises: planExercises.data ?? [],
      workoutSessions: workouts.data ?? [], setLogs: sets.data ?? [], coachEvents: events.data ?? [],
      userInsights: insights.data ?? [],
    });
  } catch {
    return sendApiError(res, 500, "ACCOUNT_EXPORT_UNAVAILABLE", "Could not prepare your data export.", true);
  }
});

router.delete("/", async (req: Request, res: Response) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return sendApiError(res, 401, "AUTH_REQUIRED", "Sign in again before deleting your account.");
  try {
    // The migration makes profiles and all user-owned children cascade from
    // auth.users, avoiding a brittle and non-atomic manual deletion list.
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    return res.json({ deleted: true });
  } catch {
    return sendApiError(res, 500, "ACCOUNT_DELETE_UNAVAILABLE", "We could not delete your account. Please try again.", true);
  }
});

export default router;

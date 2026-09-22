import { Request, Response, Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type AccountExportSection = {
  key: string;
  table: string;
  ownerColumn: "id" | "user_id";
  /**
   * Coach-job request and result columns are deliberately excluded: historical
   * rows may contain conversation text, which is not an account data log.
   */
  columns?: string;
};

// These are all account-owned tables introduced by the account/history
// migrations, plus the already-shipped account data. Every query below has an
// explicit owner filter; never use client-supplied user identifiers here.
const ACCOUNT_EXPORT_SECTIONS: readonly AccountExportSection[] = [
  { key: "profile", table: "profiles", ownerColumn: "id" },
  { key: "limitations", table: "user_limitations", ownerColumn: "user_id" },
  { key: "consents", table: "user_consents", ownerColumn: "user_id" },
  { key: "programs", table: "programs", ownerColumn: "user_id" },
  { key: "planSessions", table: "plan_sessions", ownerColumn: "user_id" },
  { key: "planExercises", table: "plan_exercises", ownerColumn: "user_id" },
  { key: "workoutSessions", table: "workout_sessions", ownerColumn: "user_id" },
  { key: "setLogs", table: "set_logs", ownerColumn: "user_id" },
  { key: "coachEvents", table: "coach_events", ownerColumn: "user_id" },
  { key: "insights", table: "user_insights", ownerColumn: "user_id" },
  { key: "identifications", table: "equipment_identifications", ownerColumn: "user_id" },
  { key: "savedEquipment", table: "saved_equipment", ownerColumn: "user_id" },
  { key: "feedback", table: "feedback", ownerColumn: "user_id" },
  { key: "completedExercises", table: "completed_exercises", ownerColumn: "user_id" },
  { key: "muscleProgress", table: "muscle_progress", ownerColumn: "user_id" },
  { key: "muscleProgressHistory", table: "muscle_progress_history", ownerColumn: "user_id" },
  { key: "installations", table: "app_installations", ownerColumn: "user_id" },
  {
    key: "coachJobs",
    table: "coach_trainer_jobs",
    ownerColumn: "user_id",
    columns: "id,status,created_at,updated_at,completed_at,timings",
  },
];

function bearerToken(req: Request): string | null {
  const authorization = req.header("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function requireAuthenticatedUser(
  req: Request,
  res: Response
): Promise<{ id: string; email: string | null; createdAt: string | null } | null> {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication is required." });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  const user = data.user;
  if (error || !user?.id) {
    res.status(401).json({ error: "Your session is no longer valid. Please sign in again." });
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at ?? null,
  };
}

router.get("/export", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const exports = await Promise.all(
      ACCOUNT_EXPORT_SECTIONS.map(async (section) => {
        const { data, error } = await supabase
          .from(section.table)
          .select(section.columns ?? "*")
          .eq(section.ownerColumn, user.id);

        if (error) {
          // Do not serve a partial deletion/export record: a missing migration
          // must be fixed before claiming a complete personal-data export.
          throw new Error(`${section.key}:${error.code || "query_failed"}`);
        }

        return [section.key, data ?? []] as const;
      })
    );

    res.set("Cache-Control", "no-store").json({
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      data: Object.fromEntries(exports),
    });
  } catch (error: any) {
    // Keep server logs metadata-only; no profile, health, or conversation data.
    console.error("[account-export] unavailable:", error?.message || "unknown_error");
    res.status(503).json({
      error: "Your data export is temporarily unavailable. Please try again after the account data migration is available.",
      code: "ACCOUNT_EXPORT_UNAVAILABLE",
    });
  }
});

router.delete("/", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    // The account/history migration makes every account-owned foreign key
    // cascade from auth.users. Deleting auth first is atomic at the database
    // boundary and avoids a brittle, silently incomplete hand-maintained list.
    const { error } = await supabase.auth.admin.deleteUser(user.id, false);
    if (error) throw error;

    res.json({ deleted: true });
  } catch (error: any) {
    console.error("[account-delete] auth deletion failed:", error?.code || "unknown_error");
    res.status(500).json({ error: "We could not delete your account. Please try again." });
  }
});

export default router;

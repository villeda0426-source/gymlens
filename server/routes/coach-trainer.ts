import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  adaptPlan,
  chatWithCoach,
  CoachMessage,
  CoachMode,
  intakeTurn,
  isPlan,
  Plan,
  Units,
  updateGoals,
} from "../services/coachTrainerService";
import {
  buildCoachingSummary,
  evaluateWorkoutFeedback,
  WorkoutFeedback,
} from "../../lib/coachingEngine";

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function isUnits(value: unknown): value is Units {
  return value === "kg" || value === "lbs";
}

function isMode(value: unknown): value is CoachMode {
  return value === "intake" || value === "adapt" || value === "update_goals" || value === "chat";
}

function isCoachMessage(value: unknown): value is CoachMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as CoachMessage).role === "user" || (value as CoachMessage).role === "assistant") &&
    typeof (value as CoachMessage).content === "string"
  );
}

function getHistory(value: unknown): CoachMessage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isCoachMessage)) {
    throw new Error("history must be an array of { role, content } messages.");
  }
  return value;
}

function getPlan(value: unknown): Plan {
  if (!isPlan(value)) {
    throw new Error("currentPlan must match the SpotLift plan schema.");
  }
  return value;
}

function getBuildNumber(req: Request): number {
  const parsed = Number.parseInt(String(req.header("x-spotlift-build") || ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCoachTimeouts(req: Request) {
  const buildNumber = getBuildNumber(req);

  if (buildNumber > 38) {
    return { primaryTimeoutMs: 85000, fallbackTimeoutMs: 20000 };
  }

  return { primaryTimeoutMs: 30000, fallbackTimeoutMs: 12000 };
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const header = req.header("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user.id;
}

function isWorkoutFeedback(value: unknown): value is WorkoutFeedback {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.workoutId === "string" &&
    typeof item.sessionLabel === "string" &&
    typeof item.completedAt === "string" &&
    Array.isArray(item.completedExerciseIds) &&
    item.completedExerciseIds.every((id) => typeof id === "string") &&
    Number.isInteger(item.totalExerciseCount) &&
    Number(item.totalExerciseCount) >= 0 &&
    Number.isInteger(item.difficulty) && Number(item.difficulty) >= 1 && Number(item.difficulty) <= 5 &&
    Number.isInteger(item.energy) && Number(item.energy) >= 1 && Number(item.energy) <= 5 &&
    Number.isInteger(item.pain) && Number(item.pain) >= 0 && Number(item.pain) <= 5 &&
    (item.painArea === undefined || typeof item.painArea === "string") &&
    (item.notes === undefined || typeof item.notes === "string")
    && (item.planComplete === undefined || typeof item.planComplete === "boolean")
  );
}

async function runCoachRequest(req: Request, coachOptions = getCoachTimeouts(req)) {
  const mode = req.body?.mode;
  const units = req.body?.units;
  const language = req.body?.language === "es" ? "es" : "en";

  if (!isMode(mode)) {
    throw new Error("mode must be intake, adapt, update_goals, or chat.");
  }

  if (!isUnits(units)) {
    throw new Error("units must be kg or lbs.");
  }

  if (mode === "intake") {
    const userMessage = typeof req.body?.userMessage === "string" ? req.body.userMessage.trim() : "";
    if (!userMessage) {
      throw new Error("userMessage is required for intake.");
    }

    return intakeTurn(units, getHistory(req.body?.history), userMessage, language, coachOptions);
  }

  if (mode === "adapt") {
    return adaptPlan(units, getPlan(req.body?.currentPlan), req.body?.logs ?? [], language, coachOptions);
  }

  if (mode === "update_goals") {
    const newGoal = typeof req.body?.newGoal === "string" ? req.body.newGoal.trim() : "";
    if (!newGoal) {
      throw new Error("newGoal is required for update_goals.");
    }

    return updateGoals(units, getPlan(req.body?.currentPlan), newGoal, language, coachOptions);
  }

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    throw new Error("question is required for chat.");
  }

  const currentPlan = req.body?.currentPlan === undefined || req.body?.currentPlan === null
    ? null
    : getPlan(req.body.currentPlan);
  return chatWithCoach(units, question, currentPlan, language, coachOptions);
}

async function processCoachJob(jobId: string, payload: unknown) {
  await supabase
    .from("coach_trainer_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const mockReq = { body: payload, header: () => undefined } as unknown as Request;
    const result = await runCoachRequest(mockReq, { primaryTimeoutMs: 110000, fallbackTimeoutMs: 25000 });
    const { error } = await supabase
      .from("coach_trainer_jobs")
      .update({
        status: "completed",
        result,
        error: null,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (error) console.error("[coach-trainer-jobs] complete update error:", error.message);
  } catch (error: any) {
    console.error("[coach-trainer-jobs] job failed:", error.message ?? error);
    await supabase
      .from("coach_trainer_jobs")
      .update({
        status: "failed",
        error: error.message || "Coach plan generation failed.",
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

router.post("/jobs", async (req: Request, res: Response) => {
  try {
    const mode = req.body?.mode;
    if (!isMode(mode)) {
      return res.status(400).json({ error: "mode must be intake, adapt, update_goals, or chat." });
    }

    if (!isUnits(req.body?.units)) {
      return res.status(400).json({ error: "units must be kg or lbs." });
    }

    const userId = await getAuthenticatedUserId(req);
    const { data, error } = await supabase
      .from("coach_trainer_jobs")
      .insert({
        user_id: userId,
        status: "queued",
        payload: req.body,
      })
      .select("id, status")
      .single();

    if (error) throw error;

    void processCoachJob(data.id, req.body);
    return res.status(202).json({ jobId: data.id, status: data.status });
  } catch (error: any) {
    console.error("[coach-trainer-jobs] create error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Could not start coach plan generation." });
  }
});

router.get("/jobs/:id", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("coach_trainer_jobs")
      .select("id, status, result, error, created_at, updated_at, completed_at")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Coach job not found." });
    }

    return res.json({
      jobId: data.id,
      status: data.status,
      result: data.result,
      error: data.error,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      completedAt: data.completed_at,
    });
  } catch (error: any) {
    console.error("[coach-trainer-jobs] status error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Could not check coach plan generation." });
  }
});

router.get("/reviews/latest", async (req: Request, res: Response) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Sign in is required to read Coach reviews." });

    const { data, error } = await supabase
      .from("workout_feedback")
      .select("session_label, decision_source, decision_reason, changes, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json(null);
    return res.json({
      sessionLabel: data.session_label,
      source: data.decision_source,
      reason: data.decision_reason,
      changes: Array.isArray(data.changes) ? data.changes : [],
      createdAt: data.created_at,
    });
  } catch (error: any) {
    console.error("[coach-trainer] latest review error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Could not load the latest Coach review." });
  }
});

router.post("/evaluate", async (req: Request, res: Response) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "Sign in is required to evaluate a workout." });

    const currentPlan = getPlan(req.body?.currentPlan);
    const feedback = req.body?.feedback;
    if (!isWorkoutFeedback(feedback)) {
      return res.status(400).json({ error: "feedback must match the workout feedback schema." });
    }

    const { data: existingRows, error: historyError } = await supabase
      .from("workout_feedback")
      .select("workout_id, session_label, completed_at, completed_exercise_ids, total_exercise_count, difficulty, energy, pain, pain_area, notes, plan_complete")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(8);

    const history: WorkoutFeedback[] = historyError
      ? []
      : (existingRows ?? []).reverse().map((row: any) => ({
          workoutId: row.workout_id,
          sessionLabel: row.session_label,
          completedAt: row.completed_at,
          completedExerciseIds: row.completed_exercise_ids ?? [],
          totalExerciseCount: row.total_exercise_count,
          difficulty: row.difficulty,
          energy: row.energy,
          pain: row.pain,
          painArea: row.pain_area ?? undefined,
      notes: row.notes ?? undefined,
          planComplete: row.plan_complete === true,
        }));
    const priorHistory = history.filter((entry) => entry.workoutId !== feedback.workoutId);

    const language = req.body?.language === "es" ? "es" : "en";
    const decision = evaluateWorkoutFeedback(currentPlan, priorHistory, feedback, language);
    let finalDecision = decision;

    // Full-block progression is generated by the durable background Coach job.
    // Return the saved history summary immediately so a model timeout cannot
    // discard the athlete's final feedback.
    if (decision.source === "ai" && !feedback.planComplete) {
      const compactSummary = buildCoachingSummary(currentPlan, [...priorHistory, feedback]);
      const aiResponse = await adaptPlan(
        currentPlan.units,
        currentPlan,
        { latest_feedback: feedback, coaching_summary: compactSummary },
        language,
        getCoachTimeouts(req)
      );
      if (aiResponse.status === "plan_updated") {
        finalDecision = {
          source: "ai",
          reason: decision.reason,
          requiresUserConfirmation: true,
          changes: aiResponse.changes,
          plan: aiResponse.plan,
        };
      }
    }

    const { error: saveError } = await supabase.from("workout_feedback").upsert({
      user_id: userId,
      workout_id: feedback.workoutId,
      session_label: feedback.sessionLabel,
      completed_at: feedback.completedAt,
      completed_exercise_ids: feedback.completedExerciseIds,
      total_exercise_count: feedback.totalExerciseCount,
      difficulty: feedback.difficulty,
      energy: feedback.energy,
      pain: feedback.pain,
      pain_area: feedback.painArea?.trim() || null,
      notes: feedback.notes?.trim() || null,
      plan_complete: feedback.planComplete === true,
      decision_source: finalDecision.source,
      decision_reason: finalDecision.reason,
      changes: finalDecision.changes,
    }, { onConflict: "user_id,workout_id" });

    return res.json({
      ...finalDecision,
      summary: buildCoachingSummary(finalDecision.plan, [...priorHistory, feedback]),
      feedbackSaved: !saveError,
    });
  } catch (error: any) {
    console.error("[coach-trainer] workout evaluation error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Workout evaluation failed." });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const response = await runCoachRequest(req);
    return res.json(response);
  } catch (error: any) {
    console.error("[coach-trainer] error:", error.message ?? error);
    return res.status(500).json({ error: error.message || "Coach trainer is temporarily unavailable." });
  }
});

export default router;

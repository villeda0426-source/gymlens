import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  adaptPlan,
  chatWithCoach,
  CoachMessage,
  CoachMode,
  getCoachTimeoutsForBuild,
  intakeTurn,
  isPlan,
  Plan,
  Units,
  updateGoals,
} from "../services/coachTrainerService";

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
  return getCoachTimeoutsForBuild(getBuildNumber(req));
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const header = req.header("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user.id;
}

async function runCoachRequest(req: Request, coachOptions = getCoachTimeouts(req)) {
  const mode = req.body?.mode;
  const units = req.body?.units;

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

    return intakeTurn(units, getHistory(req.body?.history), userMessage, coachOptions);
  }

  if (mode === "adapt") {
    return adaptPlan(units, getPlan(req.body?.currentPlan), req.body?.logs ?? [], coachOptions);
  }

  if (mode === "update_goals") {
    const newGoal = typeof req.body?.newGoal === "string" ? req.body.newGoal.trim() : "";
    if (!newGoal) {
      throw new Error("newGoal is required for update_goals.");
    }

    return updateGoals(units, getPlan(req.body?.currentPlan), newGoal, coachOptions);
  }

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    throw new Error("question is required for chat.");
  }

  const currentPlan = req.body?.currentPlan === undefined || req.body?.currentPlan === null
    ? null
    : getPlan(req.body.currentPlan);
  return chatWithCoach(units, question, currentPlan, coachOptions);
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

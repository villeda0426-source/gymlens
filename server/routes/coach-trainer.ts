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
import { getRequestId, sendApiError } from "../lib/apiContract";
import { routeCoachRequest, type RouteDecision } from "../services/coachRouter";
import { detectReliableLanguage } from "../../shared/reliableCoach";

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

class CoachRequestError extends Error {}

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
    throw new CoachRequestError("history must be an array of { role, content } messages.");
  }
  return value;
}

function getPlan(value: unknown): Plan {
  if (!isPlan(value)) {
    throw new CoachRequestError("currentPlan must match the SpotLift plan schema.");
  }
  return value;
}

function getBuildNumber(req: Request): number {
  const parsed = Number.parseInt(String(req.header("x-spotlift-build") || ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCoachOptions(req: Request) {
  const buildNumber = getBuildNumber(req);
  const mode = req.body?.mode;
  const timeouts = getCoachTimeoutsForBuild(buildNumber);

  // App Store build 38 waits synchronously and can abandon Trainer requests
  // before Sonnet finishes. Newer builds use the durable async job endpoint.
  if (buildNumber === 38 && (mode === "adapt" || mode === "update_goals")) {
    return {
      ...timeouts,
      primaryTimeoutMs: 38000,
      primaryModel: process.env.COACH_TRAINER_FALLBACK_MODEL || "claude-haiku-4-5-20251001",
      maxTokens: 3200,
      temperature: 0.2,
    };
  }

  return timeouts;
}

async function getAuthenticatedUserId(req: Request): Promise<string | null> {
  const header = req.header("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data.user) return null;
  return data.user.id;
}

// Rules-first routing for requests that are routine enough to answer without
// calling the AI model. Runs before any Claude call, so it does not interact
// with shared/reliableCoach.ts's fallback (which only fires after a Claude
// call has been made and failed). Text used only for routing/language
// detection, never logged; see coachRouter's own metadata-only logging.
function routeBeforeCoachCall(req: Request, mode: CoachMode, units: Units, language: "en" | "es" | undefined): RouteDecision {
  const rawText = [req.body?.userMessage, req.body?.question, req.body?.newGoal]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const resolvedLanguage = language ?? detectReliableLanguage(rawText || "");

  return routeCoachRequest({
    mode,
    units,
    language: resolvedLanguage,
    userMessage: typeof req.body?.userMessage === "string" ? req.body.userMessage.trim() : undefined,
    history: mode === "intake" ? getHistory(req.body?.history) : undefined,
    question: typeof req.body?.question === "string" ? req.body.question.trim() : undefined,
    newGoal: typeof req.body?.newGoal === "string" ? req.body.newGoal.trim() : undefined,
    logs: req.body?.logs,
    currentPlan: isPlan(req.body?.currentPlan) ? req.body.currentPlan : null,
  });
}

/** Exported so regressions can drive the real request body end to end. */
export async function runCoachRequest(req: Request, coachOptions = getCoachOptions(req)) {
  const mode = req.body?.mode;
  const units = req.body?.units;
  const language = req.body?.language === "es" ? "es" : req.body?.language === "en" ? "en" : undefined;

  if (!isMode(mode)) {
    throw new CoachRequestError("mode must be intake, adapt, update_goals, or chat.");
  }

  if (!isUnits(units)) {
    throw new CoachRequestError("units must be kg or lbs.");
  }

  let routeDecision: RouteDecision;
  try {
    routeDecision = routeBeforeCoachCall(req, mode, units, language);
  } catch {
    // Malformed payload for the router (e.g. bad history shape) is not the
    // router's job to reject; fall through so the existing AI-path validation
    // below produces its normal error.
    routeDecision = { route: "ai", reason: "router:invalid_payload" };
  }
  console.log(`[coach-router] mode=${mode} route=${routeDecision.route} ${routeDecision.route === "rules" ? `intent=${routeDecision.intent}` : `reason=${routeDecision.reason}`}`);
  if (routeDecision.route === "rules") return routeDecision.response;

  if (mode === "intake") {
    const userMessage = typeof req.body?.userMessage === "string" ? req.body.userMessage.trim() : "";
    if (!userMessage) {
      throw new CoachRequestError("userMessage is required for intake.");
    }

    return intakeTurn(units, getHistory(req.body?.history), userMessage, coachOptions, language);
  }

  if (mode === "adapt") {
    return adaptPlan(units, getPlan(req.body?.currentPlan), req.body?.logs ?? [], coachOptions, language);
  }

  if (mode === "update_goals") {
    const newGoal = typeof req.body?.newGoal === "string" ? req.body.newGoal.trim() : "";
    if (!newGoal) {
      throw new CoachRequestError("newGoal is required for update_goals.");
    }

    return updateGoals(units, getPlan(req.body?.currentPlan), newGoal, coachOptions, language);
  }

  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (!question) {
    throw new CoachRequestError("question is required for chat.");
  }

  const currentPlan = req.body?.currentPlan === undefined || req.body?.currentPlan === null
    ? null
    : getPlan(req.body.currentPlan);
  return chatWithCoach(units, question, currentPlan, coachOptions, language);
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
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return sendApiError(
        res,
        401,
        "AUTH_REQUIRED",
        "Sign in again before asking Coach to update your plan."
      );
    }

    const mode = req.body?.mode;
    if (!isMode(mode)) {
      return sendApiError(
        res,
        400,
        "INVALID_COACH_MODE",
        "mode must be intake, adapt, update_goals, or chat."
      );
    }

    if (!isUnits(req.body?.units)) {
      return sendApiError(res, 400, "INVALID_UNITS", "units must be kg or lbs.");
    }

    const suppliedKey = String(req.header("x-idempotency-key") || "").trim();
    const idempotencyKey =
      suppliedKey.length >= 16 && suppliedKey.length <= 200
        ? suppliedKey
        : getRequestId(res);

    const { data: existing, error: existingError } = await supabase
      .from("coach_trainer_jobs")
      .select("id, status")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) {
      return res.status(202).json({
        jobId: existing.id,
        status: existing.status,
        deduplicated: true,
      });
    }

    const { data, error } = await supabase
      .from("coach_trainer_jobs")
      .insert({
        user_id: userId,
        idempotency_key: idempotencyKey,
        status: "queued",
        payload: req.body,
      })
      .select("id, status")
      .single();

    if (error?.code === "23505") {
      const { data: racedJob, error: racedJobError } = await supabase
        .from("coach_trainer_jobs")
        .select("id, status")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .single();

      if (racedJobError) throw racedJobError;
      return res.status(202).json({
        jobId: racedJob.id,
        status: racedJob.status,
        deduplicated: true,
      });
    }

    if (error || !data) throw error || new Error("Coach job insert returned no data.");

    // Rules-routed requests finish in milliseconds (no model call), so await
    // them here: the client's first poll already sees the completed result
    // instead of waiting out a poll interval for an already-finished job.
    let routedToRules = false;
    try {
      routedToRules = routeBeforeCoachCall(req, mode, req.body.units, req.body?.language === "es" ? "es" : req.body?.language === "en" ? "en" : undefined).route === "rules";
    } catch {
      routedToRules = false;
    }
    if (routedToRules) {
      await processCoachJob(data.id, req.body);
    } else {
      void processCoachJob(data.id, req.body);
    }
    return res.status(202).json({
      jobId: data.id,
      status: data.status,
      deduplicated: false,
    });
  } catch (error: any) {
    console.error("[coach-trainer-jobs] create error:", error.message ?? error);
    return sendApiError(
      res,
      500,
      "COACH_JOB_CREATE_FAILED",
      "Could not start coach plan generation.",
      true
    );
  }
});

router.get("/jobs/:id", async (req: Request, res: Response) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return sendApiError(
        res,
        401,
        "AUTH_REQUIRED",
        "Sign in again to check this Coach update."
      );
    }

    const { data, error } = await supabase
      .from("coach_trainer_jobs")
      .select("id, status, result, error, created_at, updated_at, completed_at")
      .eq("id", req.params.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return sendApiError(res, 404, "COACH_JOB_NOT_FOUND", "Coach job not found.");
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
    return sendApiError(
      res,
      500,
      "COACH_JOB_STATUS_FAILED",
      "Could not check coach plan generation.",
      true
    );
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const response = await runCoachRequest(req);
    return res.json(response);
  } catch (error: any) {
    console.error("[coach-trainer] error:", error.message ?? error);
    if (error instanceof CoachRequestError) {
      return sendApiError(res, 400, "INVALID_COACH_REQUEST", error.message);
    }
    return sendApiError(
      res,
      500,
      "COACH_UNAVAILABLE",
      "Coach trainer is temporarily unavailable.",
      true
    );
  }
});

export default router;

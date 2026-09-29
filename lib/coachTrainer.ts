import { apiFetch, createIdempotencyKey } from "@/lib/api";

export type Units = "kg" | "lbs";
export type CoachLanguage = "en" | "es";
export type CoachMode = "intake" | "adapt" | "update_goals" | "chat";
export type CoachMessage = { role: "user" | "assistant"; content: string };

export type RepRange = { min: number; max: number };

export type CoachExercise = {
  exercise_id: string;
  name: string;
  category: "compound" | "accessory" | "warmup" | "mobility" | "cardio";
  primary_muscles: string[];
  sets: number;
  rep_range: RepRange;
  target_rpe: number | null;
  target_load: string;
  rest_seconds: number;
  tempo?: string | null;
  progression_rule: string;
  substitutions: string[];
  coach_notes: string;
};

export type CoachSession = {
  day_label: string;
  focus: string;
  estimated_minutes: number;
  exercises: CoachExercise[];
};

export type CoachPlan = {
  goal: string;
  goal_type: "strength" | "hypertrophy" | "fat_loss" | "endurance" | "general_fitness" | "sport_specific";
  experience_level: "beginner" | "intermediate" | "advanced";
  units: Units;
  timeline_weeks: number;
  days_per_week: number;
  split: string;
  equipment: string[];
  constraints: string[];
  progression_strategy: string;
  sessions: CoachSession[];
  weekly_notes: string;
  safety_flags: string[];
};

export type CoachRulesMetadata = { rulesHandled: true; routeReason: string; responseId?: string };

export type CoachResponse = (
  | { status: "gathering"; message: string }
  | { status: "reply"; message: string }
  | { status: "plan_ready"; summary: string; plan: CoachPlan }
  | { status: "plan_updated"; summary: string; changes: string[]; plan: CoachPlan }
  // This account has never completed plan-setup's safety-triage step. The
  // server made no AI call; the client should show `message` and route to
  // /plan-setup/limitations.
  | { status: "needs_safety_review"; message: string }
) & { rulesMetadata?: CoachRulesMetadata };

type TrainerRequest =
  | { mode: "intake"; units: Units; language?: CoachLanguage; history: CoachMessage[]; userMessage: string }
  | { mode: "adapt"; units: Units; language?: CoachLanguage; currentPlan: CoachPlan; logs: unknown[] }
  | { mode: "update_goals"; units: Units; language?: CoachLanguage; currentPlan: CoachPlan; newGoal: string }
  | { mode: "chat"; units: Units; language?: CoachLanguage; currentPlan?: CoachPlan | null; question: string };

type CoachTrainerRequestOptions = {
  authToken?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type CoachJobStatus = "queued" | "running" | "completed" | "failed";

export type CoachJobStartResponse = {
  jobId: string;
  status: CoachJobStatus;
};

export type CoachJobStatusResponse = {
  jobId: string;
  status: CoachJobStatus;
  result?: CoachResponse | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
};

export async function callCoachTrainer(
  payload: TrainerRequest,
  options: CoachTrainerRequestOptions = {}
): Promise<CoachResponse> {
  return apiFetch<CoachResponse>("/api/coach-trainer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  }, 120000);
}

export async function startCoachTrainerJob(
  payload: TrainerRequest,
  options: CoachTrainerRequestOptions = {}
): Promise<CoachJobStartResponse> {
  return apiFetch<CoachJobStartResponse>("/api/coach-trainer/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
      ...(options.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  }, 15000);
}

export async function getCoachTrainerJob(
  jobId: string,
  options: CoachTrainerRequestOptions = {}
): Promise<CoachJobStatusResponse> {
  return apiFetch<CoachJobStatusResponse>(`/api/coach-trainer/jobs/${jobId}`, {
    headers: {
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
    },
    signal: options.signal,
  }, 15000);
}

export async function flagRulesCoachResponse(
  metadata: CoachRulesMetadata,
  options: CoachTrainerRequestOptions = {}
): Promise<{ recorded: boolean }> {
  return apiFetch<{ recorded: boolean }>("/api/coach-trainer/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
    },
    body: JSON.stringify({ routeReason: metadata.routeReason, responseId: metadata.responseId }),
    signal: options.signal,
  }, 15000);
}

function makeAbortError(): Error {
  const error = new Error("Coach job polling aborted.");
  error.name = "AbortError";
  return error;
}

export type RunCoachJobOptions = {
  authToken: string;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxWaitMs?: number;
};

// Shared by app/(tabs)/trainer.tsx (ongoing chat) and store/planSetupStore.ts
// (the tap-only setup flow's final "Build my plan" call) so both start a job
// and poll it to completion the same way, against the same
// /api/coach-trainer/jobs contract.
export async function runCoachTrainerJob(
  payload: Parameters<typeof startCoachTrainerJob>[0],
  options: RunCoachJobOptions
): Promise<CoachResponse> {
  const { authToken, signal, pollIntervalMs = 2500, maxWaitMs = 180000 } = options;
  const idempotencyKey = createIdempotencyKey("coach-job");
  const job = await startCoachTrainerJob(payload, { authToken, idempotencyKey, signal });

  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    if (signal?.aborted) throw makeAbortError();

    const status = await getCoachTrainerJob(job.jobId, { authToken, signal });
    if (status.status === "completed" && status.result) return status.result;
    if (status.status === "failed") throw new Error(status.error || "Coach job failed.");

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, pollIntervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(makeAbortError());
        },
        { once: true }
      );
    });
  }

  throw new Error("Coach job timed out.");
}

export function makeFreeformWorkoutLog(note: string) {
  return [
    {
      date: new Date().toISOString().slice(0, 10),
      session_label: "Coach update",
      exercise_id: "general-update",
      sets: [],
      skipped: false,
      user_note: note,
    },
  ];
}

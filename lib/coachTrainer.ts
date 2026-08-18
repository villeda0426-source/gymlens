import { apiFetch } from "@/lib/api";
import type { CoachingDecision, CoachingSummary, WorkoutFeedback } from "@/lib/coachingEngine";

export type Units = "kg" | "lbs";
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

export type CoachResponse =
  | { status: "gathering"; message: string }
  | { status: "reply"; message: string }
  | { status: "plan_ready"; summary: string; plan: CoachPlan }
  | { status: "plan_updated"; summary: string; changes: string[]; plan: CoachPlan };

type TrainerRequest =
  | { mode: "intake"; units: Units; language?: "en" | "es"; history: CoachMessage[]; userMessage: string }
  | { mode: "adapt"; units: Units; language?: "en" | "es"; currentPlan: CoachPlan; logs: unknown[] }
  | { mode: "update_goals"; units: Units; language?: "en" | "es"; currentPlan: CoachPlan; newGoal: string }
  | { mode: "chat"; units: Units; language?: "en" | "es"; currentPlan?: CoachPlan | null; question: string };

type CoachTrainerRequestOptions = {
  authToken?: string;
  signal?: AbortSignal;
  language?: "en" | "es";
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
  timings?: Record<string, number | boolean> | null;
};

export async function recordCoachJobClientTiming(
  jobId: string,
  timing: Record<string, number>,
  options: CoachTrainerRequestOptions = {}
): Promise<void> {
  await apiFetch(`/api/coach-trainer/jobs/${jobId}/client-timing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
    },
    body: JSON.stringify(timing),
  }, 15_000);
}

export type WorkoutEvaluationResponse = CoachingDecision & {
  summary: CoachingSummary;
  feedbackSaved: boolean;
};

export type LatestWorkoutReviewResponse = {
  sessionLabel: string;
  source: "rules" | "ai";
  reason: string;
  changes: string[];
  createdAt: string;
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

export async function evaluateCoachWorkout(
  currentPlan: CoachPlan,
  feedback: WorkoutFeedback,
  options: CoachTrainerRequestOptions = {}
): Promise<WorkoutEvaluationResponse> {
  return apiFetch<WorkoutEvaluationResponse>("/api/coach-trainer/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
    },
    body: JSON.stringify({ currentPlan, feedback, language: options.language ?? "en" }),
    signal: options.signal,
  }, 120000);
}

export async function getLatestCoachWorkoutReview(
  options: CoachTrainerRequestOptions = {}
): Promise<LatestWorkoutReviewResponse | null> {
  return apiFetch<LatestWorkoutReviewResponse | null>("/api/coach-trainer/reviews/latest", {
    headers: {
      ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
    },
    signal: options.signal,
  }, 15000);
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

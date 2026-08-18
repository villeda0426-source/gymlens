import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!API_BASE || !SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  throw new Error("Production API and Supabase test configuration are required.");
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const email = `coach-e2e-${Date.now()}@example.com`;
const password = `E2e-${crypto.randomBytes(18).toString("base64url")}!`;
let userId: string | null = null;
let deletedThroughApi = false;

function headers(token: string, json = false) {
  return {
    Authorization: `Bearer ${token}`,
    "x-spotlift-platform": "ios",
    "x-spotlift-build": "43",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(token, Boolean(init.body)), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.error || "unknown error"}`);
  return body;
}

async function main() {
  try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: "Coach E2E" },
  });
  if (createError || !created.user) throw createError || new Error("Temporary user was not created.");
  userId = created.user.id;

  const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw signInError || new Error("Temporary user could not sign in.");
  const token = signedIn.session.access_token;

  const clientStartedAt = Date.now();
  const createStartedAt = Date.now();
  const job = await api("/api/coach-trainer/jobs", token, {
    method: "POST",
    body: JSON.stringify({
      mode: "intake",
      units: "lbs",
      language: "en",
      history: [],
      userMessage: "I am a beginner seeking general fitness. I can train 2 days per week for 35 minutes in a full gym, use pounds, and have no injuries or pain.",
    }),
  });
  const jobStartRequestMs = Date.now() - createStartedAt;

  const pollingStartedAt = Date.now();
  let pollCount = 0;
  let completed: any = null;
  while (Date.now() - pollingStartedAt < 180_000) {
    pollCount += 1;
    const status = await api(`/api/coach-trainer/jobs/${job.jobId}`, token);
    if (status.status === "failed") throw new Error(status.error || "Coach job failed.");
    if (status.status === "completed" && status.result) {
      completed = status;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  if (!completed) throw new Error("Coach job did not complete within 180 seconds.");
  if (completed.result.status !== "plan_ready") throw new Error(`Expected plan_ready, received ${completed.result.status}.`);

  const requiredServerTimings = ["queueMs", "openAiMs", "validationMs", "retryMs", "attempts", "processingMs", "databaseSaveMs"];
  for (const key of requiredServerTimings) {
    if (!Number.isFinite(completed.timings?.[key])) throw new Error(`Missing server timing: ${key}`);
  }

  const clientTiming = {
    jobStartRequestMs,
    clientPollingMs: Date.now() - pollingStartedAt,
    responseToRenderMs: 1,
    clientTotalMs: Date.now() - clientStartedAt,
    pollCount,
  };
  await api(`/api/coach-trainer/jobs/${job.jobId}/client-timing`, token, {
    method: "POST",
    body: JSON.stringify(clientTiming),
  });
  const timedJob = await api(`/api/coach-trainer/jobs/${job.jobId}`, token);
  for (const key of Object.keys(clientTiming)) {
    if (!Number.isFinite(timedJob.timings?.[key])) throw new Error(`Missing client timing: ${key}`);
  }

  const plan = completed.result.plan;
  const firstSession = plan.sessions[0];
  const feedback = await api("/api/coach-trainer/evaluate", token, {
    method: "POST",
    body: JSON.stringify({
      currentPlan: plan,
      language: "en",
      feedback: {
        workoutId: `coach-e2e-${Date.now()}`,
        sessionLabel: firstSession.day_label,
        completedAt: new Date().toISOString(),
        completedExerciseIds: firstSession.exercises.map((exercise: any) => exercise.exercise_id),
        totalExerciseCount: firstSession.exercises.length,
        difficulty: 3,
        energy: 4,
        pain: 0,
        planComplete: false,
      },
    }),
  });
  if (!feedback.feedbackSaved) throw new Error("Workout feedback was evaluated but not saved.");

  const review = await api("/api/coach-trainer/reviews/latest", token);
  if (!review?.sessionLabel || review.sessionLabel !== firstSession.day_label) {
    throw new Error("Saved Coach review did not read back correctly.");
  }

  await api("/api/account", token, { method: "DELETE" });
  deletedThroughApi = true;
  const { data: deletedUser } = await admin.auth.admin.getUserById(userId);
  if (deletedUser.user) throw new Error("Temporary auth user still exists after account deletion.");

  console.log("PASS authenticated Coach job creation and ownership");
  console.log("PASS queue/OpenAI/validation/retry/database timing persistence");
  console.log("PASS client polling/render timing merge");
  console.log("PASS workout feedback persistence and latest-review readback");
  console.log("PASS account deletion and temporary-user cleanup");
  console.log(`TIMINGS ${JSON.stringify(timedJob.timings)}`);
  } finally {
  if (userId && !deletedThroughApi) {
    await admin.from("workout_feedback").delete().eq("user_id", userId);
    await admin.from("coach_trainer_jobs").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
  }
}

void main().catch((error) => {
  console.error(`FAIL ${error?.message || error}`);
  process.exitCode = 1;
});

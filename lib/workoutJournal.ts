// Workout journal persistence: the workout occurrence (workout_sessions)
// shared by the guided session and the Workout Log, quick completion, and
// the optional workout extras (cardio, water). Direct Supabase calls under
// RLS, same pattern as lib/workoutSetLogs.ts.
//
// Rollout safety: these tables come from
// supabase/migrations/20261021180000_workout_journal.sql. Until it's applied,
// journalAvailable() is false and callers skip journal writes — set logging
// keeps working exactly as before, and the extras section stays hidden.
import { supabase } from "./supabase";
import type { Units } from "./coachTrainer";
import type { CardioActivity } from "./workoutJournalRules";
import { hydrationQuickAdd } from "./workoutJournalRules";

// ─── Schema availability ─────────────────────────────────────────────────────

let availability: Promise<boolean> | null = null;

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    /does not exist|could not find the table|schema cache/i.test(error.message ?? "")
  );
}

export function journalAvailable(): Promise<boolean> {
  if (!availability) {
    availability = (async () => {
      // workout_sessions alone isn't proof: an older design already created
      // it in production. The hydration table only exists once this
      // journal's migration is applied.
      const { error } = await supabase.from("workout_hydration_entries").select("id").limit(1);
      if (!error) return true;
      if (isMissingRelation(error)) return false;
      // Network/auth trouble: don't remember the answer, ask again later.
      availability = null;
      return false;
    })();
  }
  return availability;
}

// ─── Workout occurrences ─────────────────────────────────────────────────────

export interface PlanSessionRef {
  userId: string;
  threadId: string | null;
  sessionIndex: number;
  sessionLabel: string | null;
  planWeek: number | null;
}

function startOfLocalDayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

// The occurrence of this plan workout: one still in progress, or one from
// today. Null when there isn't one yet (or the journal isn't available).
export async function findPlanSession(ref: PlanSessionRef): Promise<string | null> {
  if (!(await journalAvailable())) return null;
  let query = supabase
    .from("workout_sessions")
    .select("id, status, started_at")
    .eq("user_id", ref.userId)
    .eq("source", "plan")
    .eq("session_index", ref.sessionIndex)
    .or(`status.eq.in_progress,started_at.gte."${startOfLocalDayIso()}"`)
    .order("started_at", { ascending: false })
    .limit(1);
  query = ref.threadId ? query.eq("plan_thread_id", ref.threadId) : query.is("plan_thread_id", null);
  query = ref.sessionLabel ? query.eq("session_label", ref.sessionLabel) : query;
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

export async function findOrCreatePlanSession(ref: PlanSessionRef): Promise<string | null> {
  if (!(await journalAvailable())) return null;
  const existing = await findPlanSession(ref);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({
      user_id: ref.userId,
      started_at: new Date().toISOString(),
      source: "plan",
      plan_thread_id: ref.threadId,
      session_index: ref.sessionIndex,
      session_label: ref.sessionLabel,
      plan_week: ref.planWeek,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function createAdHocSession(userId: string): Promise<string | null> {
  if (!(await journalAvailable())) return null;
  const { data, error } = await supabase.from("workout_sessions").insert({ user_id: userId, source: "adhoc", started_at: new Date().toISOString() }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function updateSessionTiming(sessionId: string, elapsedSeconds: number, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      elapsed_seconds: Math.max(0, Math.round(elapsedSeconds)),
      ...(completed ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", sessionId);
  if (error) throw error;
}

// ─── Quick completion ────────────────────────────────────────────────────────
// Done without details: completion only — no sets, reps, weight or records.

export async function recordQuickCompletion(args: {
  userId: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
}): Promise<void> {
  const { error } = await supabase.from("workout_exercise_completions").upsert(
    {
      user_id: args.userId,
      workout_session_id: args.sessionId,
      exercise_id: args.exerciseId,
      exercise_name: args.exerciseName,
    },
    { onConflict: "workout_session_id,exercise_id", ignoreDuplicates: true }
  );
  if (error) throw error;
}

export async function removeQuickCompletion(sessionId: string, exerciseId: string): Promise<void> {
  const { error } = await supabase
    .from("workout_exercise_completions")
    .delete()
    .eq("workout_session_id", sessionId)
    .eq("exercise_id", exerciseId);
  if (error) throw error;
}

export async function hasQuickCompletion(sessionId: string, exerciseId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("workout_exercise_completions")
    .select("id")
    .eq("workout_session_id", sessionId)
    .eq("exercise_id", exerciseId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// ─── Cardio ──────────────────────────────────────────────────────────────────

export interface CardioEntry {
  id: string;
  activity: CardioActivity;
  activity_label: string | null;
  duration_minutes: number | null;
}

function toCardio(row: any): CardioEntry {
  return {
    id: row.id,
    activity: row.activity,
    activity_label: row.activity_label ?? null,
    duration_minutes: row.duration_minutes === null || row.duration_minutes === undefined ? null : Number(row.duration_minutes),
  };
}

export async function listCardio(sessionId: string): Promise<CardioEntry[]> {
  const { data, error } = await supabase
    .from("workout_cardio_entries")
    .select("id, activity, activity_label, duration_minutes")
    .eq("workout_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toCardio);
}

export async function saveCardio(args: {
  userId: string;
  sessionId: string;
  id?: string | null;
  activity: CardioActivity;
  durationMinutes: number | null;
}): Promise<CardioEntry> {
  const values = { activity: args.activity, duration_minutes: args.durationMinutes };
  const query = args.id
    ? supabase.from("workout_cardio_entries").update(values).eq("id", args.id)
    : supabase.from("workout_cardio_entries").insert({ ...values, user_id: args.userId, workout_session_id: args.sessionId });
  const { data, error } = await query.select("id, activity, activity_label, duration_minutes").single();
  if (error) throw error;
  return toCardio(data);
}

export async function deleteCardio(id: string): Promise<void> {
  const { error } = await supabase.from("workout_cardio_entries").delete().eq("id", id);
  if (error) throw error;
}

// ─── Water ───────────────────────────────────────────────────────────────────

export interface HydrationEntry {
  id: string;
  amount_ml: number;
  created_at: string;
}

export async function listHydration(sessionId: string): Promise<HydrationEntry[]> {
  const { data, error } = await supabase
    .from("workout_hydration_entries")
    .select("id, amount_ml, created_at")
    .eq("workout_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, amount_ml: Number(row.amount_ml), created_at: row.created_at }));
}

export async function addHydration(args: { userId: string; sessionId: string; units: Units }): Promise<HydrationEntry> {
  const quick = hydrationQuickAdd(args.units);
  const { data, error } = await supabase
    .from("workout_hydration_entries")
    .insert({
      user_id: args.userId,
      workout_session_id: args.sessionId,
      amount_ml: quick.ml,
      entered_amount: quick.amount,
      entered_unit: quick.unit,
    })
    .select("id, amount_ml, created_at")
    .single();
  if (error) throw error;
  return { id: data.id, amount_ml: Number(data.amount_ml), created_at: data.created_at };
}

export async function deleteHydration(id: string): Promise<void> {
  const { error } = await supabase.from("workout_hydration_entries").delete().eq("id", id);
  if (error) throw error;
}

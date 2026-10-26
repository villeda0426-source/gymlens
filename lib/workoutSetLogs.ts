// Workout Log persistence — one row per logged set (public.workout_set_logs,
// supabase/migrations/20261001010000_add_workout_set_logs.sql). Direct
// Supabase calls from the client, protected by RLS (auth.uid() = user_id) —
// the same pattern store/planSetupStore.ts already uses for
// user_consents/user_limitations, not a server route.
import { supabase } from "./supabase";
import type { Units } from "./coachTrainer";
import { journalAvailable } from "./workoutJournal";
import {
  canonicalExerciseKey,
  computeExerciseBest,
  computeSetRecords,
  type SetHistoryRow,
} from "./workoutJournalRules";

// 1 lb = 0.45359237 kg exactly (international pound).
const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: Units): number {
  return unit === "kg" ? value : value * KG_PER_LB;
}

export function fromKg(valueKg: number, unit: Units): number {
  return unit === "kg" ? valueKg : valueKg / KG_PER_LB;
}

export interface WorkoutSetRow {
  id: string;
  setNumber: number;
  reps: number | null;
  weightValue: number | null;
  weightUnit: Units;
  completed: boolean;
}

export interface WorkoutLogContext {
  userId: string;
  exerciseId: string;
  exerciseName: string;
  planThreadId: string | null;
  sessionIndex: number | null;
  sessionLabel: string | null;
  planWeek: number | null;
  // Journal fields (workout_journal migration). Written only once that
  // migration is applied, so older databases keep accepting saves.
  workoutSessionId?: string | null;
  entrySource?: "guided" | "table" | "copied_previous";
  equipmentId?: string | null;
}

function mapRow(row: {
  id: string;
  set_number: number;
  reps: number | null;
  weight_value: number | null;
  weight_unit: string;
  completed: boolean;
}): WorkoutSetRow {
  return {
    id: row.id,
    setNumber: row.set_number,
    reps: row.reps,
    weightValue: row.weight_value,
    weightUnit: row.weight_unit === "kg" ? "kg" : "lbs",
    completed: row.completed,
  };
}

// Local-calendar-day boundary, not UTC — "today" means the device's today.
function startOfLocalDayIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

// Screen-open: an existing same-day instance for this user+exercise, scoped
// to the same plan thread when we have one (a different thread's sets for
// the same exercise name shouldn't merge into today's instance). Null means
// "no instance yet" — the caller holds draft rows locally until first edit.
export async function findTodayInstance(
  ctx: WorkoutLogContext
): Promise<{ instanceId: string; sets: WorkoutSetRow[] } | null> {
  let query = supabase
    .from("workout_set_logs")
    .select("id, workout_instance_id, set_number, reps, weight_value, weight_unit, completed")
    .eq("user_id", ctx.userId)
    .eq("exercise_id", ctx.exerciseId)
    .gte("performed_at", startOfLocalDayIso())
    .order("set_number", { ascending: true });

  query = ctx.planThreadId ? query.eq("plan_thread_id", ctx.planThreadId) : query.is("plan_thread_id", null);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;

  return {
    instanceId: data[0].workout_instance_id,
    sets: data.map(mapRow),
  };
}

// Completed history for one movement (all plan weeks/occurrences of it —
// lib/workoutJournalRules.ts canonicalExerciseKey), newest first. Records
// are derived from these rows on every read, so edits and deletions are
// reflected immediately. select("*") so it works before and after the
// journal migration adds set_kind/workout_session_id.
export async function fetchExerciseHistory(userId: string, exerciseId: string): Promise<Array<SetHistoryRow & { performed_at: string; reps: number | null }>> {
  const key = canonicalExerciseKey(exerciseId);
  const { data, error } = await supabase
    .from("workout_set_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("completed", true)
    .or(`exercise_id.eq."${key}",exercise_id.like."${key}-w*",exercise_id.like."${key}-s*"`)
    .order("performed_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as Array<SetHistoryRow & { performed_at: string; reps: number | null }>;
}

export interface ExerciseRecords {
  // set number -> previous best (kg), excluding the visit being logged.
  bySetNumber: Map<number, number>;
  // Exercise-wide best (kg), including today's confirmed sets.
  best: number | null;
  // The most recent earlier visit's completed sets, for "Use previous sets".
  previousSets: Array<{ setNumber: number; reps: number | null; weightKg: number | null }>;
}

export async function fetchExerciseRecords(args: {
  userId: string;
  exerciseId: string;
  currentInstanceId: string | null;
  currentSessionId?: string | null;
  lowerIsBetter?: boolean;
}): Promise<ExerciseRecords> {
  const history = await fetchExerciseHistory(args.userId, args.exerciseId);
  const bySetNumber = computeSetRecords(history, {
    exerciseId: args.exerciseId,
    excludeInstanceId: args.currentInstanceId,
    excludeSessionId: args.currentSessionId ?? null,
    lowerIsBetter: args.lowerIsBetter,
  });
  const best = computeExerciseBest(history, { exerciseId: args.exerciseId, lowerIsBetter: args.lowerIsBetter });
  const earlier = history.filter(
    (row) =>
      row.workout_instance_id !== args.currentInstanceId &&
      (!args.currentSessionId || row.workout_session_id !== args.currentSessionId) &&
      (row.set_kind ?? "working") === "working"
  );
  const lastInstance = earlier[0]?.workout_instance_id;
  const previousSets = earlier
    .filter((row) => row.workout_instance_id === lastInstance)
    .map((row) => ({
      setNumber: row.set_number,
      reps: row.reps ?? null,
      weightKg: row.weight_kg === null || row.weight_kg === undefined ? null : Number(row.weight_kg),
    }))
    .sort((a, b) => a.setNumber - b.setNumber);
  return { bySetNumber, best, previousSets };
}

export interface SetInput {
  setNumber: number;
  reps: number | null;
  weightValue: number | null;
  weightUnit: Units;
  completed: boolean;
}

// Creates the row the first time a draft set is touched (edit, toggle, or
// Add set); every call after that updates the same row via the unique
// (workout_instance_id, set_number) pair. weight_kg is always derived here,
// never passed in, so it can never drift from weight_value/weight_unit.
export async function upsertSet(
  ctx: WorkoutLogContext,
  instanceId: string,
  set: SetInput
): Promise<WorkoutSetRow> {
  const weightKg = set.weightValue !== null ? toKg(set.weightValue, set.weightUnit) : null;
  const journal = await journalAvailable();

  const { data, error } = await supabase
    .from("workout_set_logs")
    .upsert(
      {
        user_id: ctx.userId,
        workout_instance_id: instanceId,
        exercise_id: ctx.exerciseId,
        exercise_name: ctx.exerciseName,
        plan_thread_id: ctx.planThreadId,
        session_index: ctx.sessionIndex,
        session_label: ctx.sessionLabel,
        plan_week: ctx.planWeek,
        set_number: set.setNumber,
        reps: set.reps,
        weight_value: set.weightValue,
        weight_unit: set.weightUnit,
        weight_kg: weightKg,
        completed: set.completed,
        // Only what's known: an edit without a workout link must not unlink
        // a set that already has one.
        ...(journal && ctx.workoutSessionId ? { workout_session_id: ctx.workoutSessionId } : {}),
        ...(journal && ctx.entrySource ? { entry_source: ctx.entrySource } : {}),
        ...(journal && ctx.equipmentId ? { equipment_id: ctx.equipmentId } : {}),
      },
      { onConflict: "workout_instance_id,set_number" }
    )
    .select("id, set_number, reps, weight_value, weight_unit, completed")
    .single();

  if (error) throw error;
  return mapRow(data);
}

// Renumbering after a delete updates the row by id — an upsert keyed on
// (workout_instance_id, set_number) would insert a new row instead.
// Row level security refuses a write by matching no rows, not with an
// error — so check a row was actually changed, or the set would look
// removed until the log is reopened.
export async function updateSetNumber(setId: string, setNumber: number): Promise<void> {
  const { data, error } = await supabase.from("workout_set_logs").update({ set_number: setNumber }).eq("id", setId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Set was not renumbered");
}

export async function deleteSet(setId: string): Promise<void> {
  const { data, error } = await supabase.from("workout_set_logs").delete().eq("id", setId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Set was not deleted");
}

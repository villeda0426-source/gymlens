// Workout Log persistence — one row per logged set (public.workout_set_logs,
// supabase/migrations/20261001010000_add_workout_set_logs.sql). Direct
// Supabase calls from the client, protected by RLS (auth.uid() = user_id) —
// the same pattern store/planSetupStore.ts already uses for
// user_consents/user_limitations, not a server route.
import { supabase } from "./supabase";
import type { Units } from "./coachTrainer";

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

// Max weight_kg across ALL of this user's saved sets for this exercise,
// regardless of Done state or which instance/day — the PR is derived, never
// editable, and independent of today's instance.
export async function fetchPersonalRecordKg(userId: string, exerciseId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("workout_set_logs")
    .select("weight_kg")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .not("weight_kg", "is", null)
    .order("weight_kg", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.weight_kg ?? null;
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
      },
      { onConflict: "workout_instance_id,set_number" }
    )
    .select("id, set_number, reps, weight_value, weight_unit, completed")
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function deleteSet(setId: string): Promise<void> {
  const { error } = await supabase.from("workout_set_logs").delete().eq("id", setId);
  if (error) throw error;
}

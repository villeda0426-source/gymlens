// Pure workout-journal rules — no app or network imports, so every rule is
// covered by tests/workoutJournal.rules.test.ts. The I/O side lives in
// lib/workoutJournal.ts and lib/workoutSetLogs.ts.

// ─── Exercise identity ───────────────────────────────────────────────────────
// Plan exercise ids carry occurrence suffixes so each workout tracks its own
// completion: week 2+ adds "-w2", a template repeated in one week adds
// "-w1d3", a reworked workout adds "-s4" (store/coachTrainerStore.ts,
// app/(tabs)/trainer.tsx). History and records belong to the movement, so
// those suffixes are stripped. A swapped exercise ("x-swap-y") is a
// different movement and keeps its own identity.
export function canonicalExerciseKey(exerciseId: string): string {
  return exerciseId.trim().replace(/(?:-w\d+(?:d\d+)?|-s\d+)+$/i, "");
}

// The stored exercise ids that belong to one movement (for a query).
export function sameExercise(exerciseId: string, candidateId: string): boolean {
  return canonicalExerciseKey(exerciseId) === canonicalExerciseKey(candidateId);
}

// Exercises logged outside a plan (e.g. from an equipment page) get an id
// that can never be mistaken for a plan exercise.
export function adHocExerciseId(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `custom:${slug || "exercise"}`;
}

// ─── Records by set number ───────────────────────────────────────────────────
// RULE (deliberate, centralized here so it can change in one place): a set's
// record is the highest completed weight ever logged at that set number for
// the same exercise and user, regardless of reps. For assisted exercises
// (lowerIsBetter) it's the least assistance. Only confirmed, completed
// working sets count; drafts, copied-but-unconfirmed values, warm-ups,
// quick completions (which have no sets) and the workout in progress never
// do. Weights compare in kg.

export interface SetHistoryRow {
  exercise_id: string;
  set_number: number;
  weight_kg: number | string | null;
  completed: boolean;
  workout_instance_id: string;
  workout_session_id?: string | null;
  set_kind?: string | null;
}

export interface SetRecordOptions {
  exerciseId: string;
  // The visit being logged right now — excluded so the reference doesn't
  // move while the person types.
  excludeInstanceId?: string | null;
  excludeSessionId?: string | null;
  lowerIsBetter?: boolean;
}

function eligible(row: SetHistoryRow, options: SetRecordOptions): number | null {
  if (!row.completed) return null;
  if ((row.set_kind ?? "working") !== "working") return null;
  if (!sameExercise(options.exerciseId, row.exercise_id)) return null;
  if (options.excludeInstanceId && row.workout_instance_id === options.excludeInstanceId) return null;
  if (options.excludeSessionId && row.workout_session_id === options.excludeSessionId) return null;
  if (row.weight_kg === null || row.weight_kg === undefined || row.weight_kg === "") return null;
  const kg = Number(row.weight_kg);
  return Number.isFinite(kg) ? kg : null;
}

function better(a: number, b: number, lowerIsBetter: boolean): boolean {
  return lowerIsBetter ? a < b : a > b;
}

// set number -> record weight in kg. A set number with no eligible history
// is simply absent.
export function computeSetRecords(rows: SetHistoryRow[], options: SetRecordOptions): Map<number, number> {
  const records = new Map<number, number>();
  for (const row of rows) {
    const kg = eligible(row, options);
    if (kg === null) continue;
    const current = records.get(row.set_number);
    if (current === undefined || better(kg, current, !!options.lowerIsBetter)) records.set(row.set_number, kg);
  }
  return records;
}

// The exercise-wide best (the "Personal best" header) — same eligibility,
// any set number, and it may include today's confirmed sets.
export function computeExerciseBest(
  rows: SetHistoryRow[],
  options: Pick<SetRecordOptions, "exerciseId" | "lowerIsBetter">
): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const kg = eligible(row, { exerciseId: options.exerciseId });
    if (kg === null) continue;
    if (best === null || better(kg, best, !!options.lowerIsBetter)) best = kg;
  }
  return best;
}

// ─── Units ───────────────────────────────────────────────────────────────────

export const KG_PER_LB = 0.45359237;
export const ML_PER_FL_OZ = 29.5735295625;

export type WeightUnit = "kg" | "lbs";

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  const value = unit === "kg" ? kg : kg / KG_PER_LB;
  return Math.round(value * 10) / 10;
}

// One-tap water amounts: 8 fl oz in imperial, 250 ml in metric.
export function hydrationQuickAdd(unit: WeightUnit): { amount: number; unit: "fl_oz" | "ml"; ml: number } {
  return unit === "lbs"
    ? { amount: 8, unit: "fl_oz", ml: Math.round(8 * ML_PER_FL_OZ * 100) / 100 }
    : { amount: 250, unit: "ml", ml: 250 };
}

// Total logged for this workout, in the person's units.
export function hydrationDisplayTotal(entriesMl: number[], unit: WeightUnit): { amount: number; unit: "fl_oz" | "ml" } {
  const totalMl = entriesMl.reduce((sum, ml) => sum + ml, 0);
  return unit === "lbs"
    ? { amount: Math.round(totalMl / ML_PER_FL_OZ), unit: "fl_oz" }
    : { amount: Math.round(totalMl), unit: "ml" };
}

// ─── Cardio ──────────────────────────────────────────────────────────────────

export const CARDIO_ACTIVITIES = ["walking", "cycling", "running", "elliptical", "rowing", "stairs", "other"] as const;
export type CardioActivity = (typeof CARDIO_ACTIVITIES)[number];

// Minutes the person typed, or null when left blank — never 0 for "missing".
export function parseCardioMinutes(text: string): number | null | "invalid" {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > 600) return "invalid";
  return Math.round(value * 10) / 10;
}

// ─── Reliable set saving ─────────────────────────────────────────────────────
// Guided logging and table edits share one save path. A set is keyed by
// (workout_instance_id, set_number) — the same unique pair the database
// upserts on — so repeated taps and retries update one row, never add one.

export type SaveStatus = "pending" | "saved" | "failed";

export interface QueuedSet {
  key: string;
  instanceId: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number | null;
  weightValue: number | null;
  weightUnit: WeightUnit;
  status: SaveStatus;
  attempts: number;
}

export function setKey(instanceId: string, setNumber: number): string {
  return `${instanceId}:${setNumber}`;
}

// Adds or replaces the entry for that set (latest values win), back to pending.
export function enqueueSet(queue: QueuedSet[], entry: Omit<QueuedSet, "key" | "status" | "attempts">): QueuedSet[] {
  const key = setKey(entry.instanceId, entry.setNumber);
  const existing = queue.find((item) => item.key === key);
  const next: QueuedSet = { ...entry, key, status: "pending", attempts: existing?.attempts ?? 0 };
  return existing ? queue.map((item) => (item.key === key ? next : item)) : [...queue, next];
}

export function markSet(queue: QueuedSet[], key: string, status: SaveStatus): QueuedSet[] {
  return queue.map((item) =>
    item.key === key ? { ...item, status, attempts: status === "pending" ? item.attempts : item.attempts + 1 } : item
  );
}

// Saved entries can be dropped; pending/failed ones are kept (and persisted
// on the device) until the server confirms them.
export function unsavedSets(queue: QueuedSet[]): QueuedSet[] {
  return queue.filter((item) => item.status !== "saved");
}

// Runs every not-yet-saved entry through `save` once. Entries already being
// saved are skipped by the caller holding `inFlight`.
export async function flushQueue(
  queue: QueuedSet[],
  save: (item: QueuedSet) => Promise<void>,
  inFlight: Set<string> = new Set()
): Promise<QueuedSet[]> {
  let next = queue;
  for (const item of queue) {
    if (item.status === "saved" || inFlight.has(item.key)) continue;
    inFlight.add(item.key);
    try {
      await save(item);
      next = markSet(next, item.key, "saved");
    } catch {
      next = markSet(next, item.key, "failed");
    } finally {
      inFlight.delete(item.key);
    }
  }
  return next;
}

// The next set to log in the guided session after returning from the log:
// the first planned set not yet completed (never a count — sets 1 and 3 done
// means set 2 is next, not set 3, which would overwrite it).
export function nextOpenSetNumber(completedSetNumbers: number[], plannedSets: number): number | null {
  const done = new Set(completedSetNumbers);
  for (let n = 1; n <= plannedSets; n += 1) if (!done.has(n)) return n;
  return null;
}

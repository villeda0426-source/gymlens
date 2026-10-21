// Workout journal data rules. Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adHocExerciseId,
  canonicalExerciseKey,
  computeExerciseBest,
  computeSetRecords,
  enqueueSet,
  flushQueue,
  hydrationDisplayTotal,
  hydrationQuickAdd,
  KG_PER_LB,
  kgToDisplay,
  nextOpenSetNumber,
  parseCardioMinutes,
  unsavedSets,
  type QueuedSet,
  type SetHistoryRow,
} from "../lib/workoutJournalRules";

const lb = (pounds: number) => pounds * KG_PER_LB;

function row(partial: Partial<SetHistoryRow> & Pick<SetHistoryRow, "set_number" | "weight_kg">): SetHistoryRow {
  return { exercise_id: "barbell_bench", completed: true, workout_instance_id: "old-1", set_kind: "working", ...partial };
}

test("each set number shows its own record (40 / 55 / 60)", () => {
  const rows = [
    row({ set_number: 1, weight_kg: lb(40) }),
    row({ set_number: 2, weight_kg: lb(55) }),
    row({ set_number: 3, weight_kg: lb(60) }),
    row({ set_number: 1, weight_kg: lb(35), workout_instance_id: "old-2" }),
  ];
  const records = computeSetRecords(rows, { exerciseId: "barbell_bench" });
  assert.deepEqual([1, 2, 3].map((n) => kgToDisplay(records.get(n)!, "lbs")), [40, 55, 60]);
});

test("a new record on set 3 doesn't change sets 1 or 2", () => {
  const base = [row({ set_number: 1, weight_kg: lb(40) }), row({ set_number: 2, weight_kg: lb(55) }), row({ set_number: 3, weight_kg: lb(60) })];
  const after = computeSetRecords([...base, row({ set_number: 3, weight_kg: lb(70), workout_instance_id: "old-3" })], { exerciseId: "barbell_bench" });
  assert.equal(kgToDisplay(after.get(1)!, "lbs"), 40);
  assert.equal(kgToDisplay(after.get(2)!, "lbs"), 55);
  assert.equal(kgToDisplay(after.get(3)!, "lbs"), 70);
});

test("set numbers without eligible history are absent (shown as —)", () => {
  const records = computeSetRecords([row({ set_number: 1, weight_kg: lb(40) })], { exerciseId: "barbell_bench" });
  assert.equal(records.has(2), false);
  assert.equal(records.has(4), false);
});

test("drafts, warm-ups, other exercises and missing weights never count", () => {
  const records = computeSetRecords(
    [
      row({ set_number: 1, weight_kg: lb(100), completed: false }),
      row({ set_number: 1, weight_kg: lb(90), set_kind: "warmup" }),
      row({ set_number: 1, weight_kg: lb(95), exercise_id: "incline_bench" }),
      row({ set_number: 1, weight_kg: null }),
      row({ set_number: 1, weight_kg: lb(45) }),
    ],
    { exerciseId: "barbell_bench" }
  );
  assert.equal(kgToDisplay(records.get(1)!, "lbs"), 45);
});

test("the workout in progress is excluded so values don't move while logging", () => {
  const rows = [
    row({ set_number: 1, weight_kg: lb(40) }),
    row({ set_number: 1, weight_kg: lb(80), workout_instance_id: "today", workout_session_id: "session-today" }),
  ];
  assert.equal(kgToDisplay(computeSetRecords(rows, { exerciseId: "barbell_bench", excludeInstanceId: "today" }).get(1)!, "lbs"), 40);
  assert.equal(kgToDisplay(computeSetRecords(rows, { exerciseId: "barbell_bench", excludeSessionId: "session-today" }).get(1)!, "lbs"), 40);
});

test("edits and deletions invalidate records: they're recomputed from current rows", () => {
  const rows = [row({ set_number: 2, weight_kg: lb(55), workout_instance_id: "a" }), row({ set_number: 2, weight_kg: lb(65), workout_instance_id: "b" })];
  assert.equal(kgToDisplay(computeSetRecords(rows, { exerciseId: "barbell_bench" }).get(2)!, "lbs"), 65);
  // Deleting the 65 lb set (row gone) drops the record back to 55.
  assert.equal(kgToDisplay(computeSetRecords(rows.slice(0, 1), { exerciseId: "barbell_bench" }).get(2)!, "lbs"), 55);
  // Un-completing it does the same.
  const uncompleted = [rows[0], { ...rows[1], completed: false }];
  assert.equal(kgToDisplay(computeSetRecords(uncompleted, { exerciseId: "barbell_bench" }).get(2)!, "lbs"), 55);
});

test("units: records compare in kg and display in the person's unit", () => {
  const records = computeSetRecords(
    [row({ set_number: 1, weight_kg: 20 }), row({ set_number: 1, weight_kg: lb(45), workout_instance_id: "x" })],
    { exerciseId: "barbell_bench" }
  );
  // 45 lb (20.41 kg) beats 20 kg.
  assert.equal(kgToDisplay(records.get(1)!, "lbs"), 45);
  assert.equal(kgToDisplay(records.get(1)!, "kg"), 20.4);
  // Stored numerics may arrive as strings from PostgREST.
  assert.equal(computeSetRecords([row({ set_number: 1, weight_kg: "27.22" })], { exerciseId: "barbell_bench" }).get(1), 27.22);
});

test("assisted exercises: the record is the least assistance", () => {
  const records = computeSetRecords(
    [row({ set_number: 1, weight_kg: 30, exercise_id: "assisted_pullup" }), row({ set_number: 1, weight_kg: 20, exercise_id: "assisted_pullup", workout_instance_id: "x" })],
    { exerciseId: "assisted_pullup", lowerIsBetter: true }
  );
  assert.equal(records.get(1), 20);
});

test("plan occurrence suffixes share history; swaps don't", () => {
  assert.equal(canonicalExerciseKey("goblet_squat-w2"), "goblet_squat");
  assert.equal(canonicalExerciseKey("goblet_squat-w1d3"), "goblet_squat");
  assert.equal(canonicalExerciseKey("leg-press-s4"), "leg-press");
  assert.notEqual(canonicalExerciseKey("bench-swap-push-up"), "bench");
  const records = computeSetRecords([row({ set_number: 1, weight_kg: lb(40), exercise_id: "barbell_bench-w2" })], { exerciseId: "barbell_bench-w3" });
  assert.equal(kgToDisplay(records.get(1)!, "lbs"), 40);
});

test("the Personal best header uses the same eligibility", () => {
  const rows = [row({ set_number: 1, weight_kg: lb(60) }), row({ set_number: 2, weight_kg: lb(90), completed: false })];
  assert.equal(kgToDisplay(computeExerciseBest(rows, { exerciseId: "barbell_bench" })!, "lbs"), 60);
  assert.equal(computeExerciseBest([], { exerciseId: "barbell_bench" }), null);
});

test("ad-hoc exercises never look like plan exercise ids", () => {
  assert.equal(adHocExerciseId("Prensa de Piernas"), "custom:prensa-de-piernas");
  assert.ok(adHocExerciseId("Leg Press").startsWith("custom:"));
});

test("hydration: 8 fl oz imperial, 250 ml metric, totals per workout", () => {
  const imperial = hydrationQuickAdd("lbs");
  assert.deepEqual([imperial.amount, imperial.unit], [8, "fl_oz"]);
  assert.equal(imperial.ml, 236.59);
  assert.deepEqual(hydrationDisplayTotal([imperial.ml, imperial.ml], "lbs"), { amount: 16, unit: "fl_oz" });
  assert.deepEqual(hydrationQuickAdd("kg"), { amount: 250, unit: "ml", ml: 250 });
  assert.deepEqual(hydrationDisplayTotal([250, 236.59], "kg"), { amount: 487, unit: "ml" });
  assert.deepEqual(hydrationDisplayTotal([], "lbs"), { amount: 0, unit: "fl_oz" });
});

test("cardio minutes: blank stays missing, never 0", () => {
  assert.equal(parseCardioMinutes(""), null);
  assert.equal(parseCardioMinutes("  "), null);
  assert.equal(parseCardioMinutes("12.5"), 12.5);
  assert.equal(parseCardioMinutes("12,5"), 12.5);
  assert.equal(parseCardioMinutes("0"), "invalid");
  assert.equal(parseCardioMinutes("abc"), "invalid");
});

const entry = (setNumber: number, reps = 6): Omit<QueuedSet, "key" | "status" | "attempts"> => ({
  instanceId: "inst-1",
  exerciseId: "barbell_bench",
  exerciseName: "Barbell Bench Press",
  setNumber,
  reps,
  weightValue: 55,
  weightUnit: "lbs",
});

test("repeated taps on the same set keep one entry with the latest values", () => {
  let queue = enqueueSet([], entry(1, 6));
  queue = enqueueSet(queue, entry(1, 8));
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reps, 8);
});

test("a failed save keeps the set and its values; retry saves it once", async () => {
  const saved: number[] = [];
  let failNext = true;
  const save = async (item: QueuedSet) => {
    if (failNext) {
      failNext = false;
      throw new Error("network");
    }
    saved.push(item.setNumber);
  };
  let queue = enqueueSet([], entry(1));
  queue = await flushQueue(queue, save);
  assert.equal(queue[0].status, "failed");
  assert.equal(queue[0].reps, 6);
  assert.equal(unsavedSets(queue).length, 1);
  queue = await flushQueue(queue, save);
  assert.equal(queue[0].status, "saved");
  assert.deepEqual(saved, [1]);
  // Flushing again doesn't resend a saved set.
  queue = await flushQueue(queue, save);
  assert.deepEqual(saved, [1]);
  assert.equal(unsavedSets(queue).length, 0);
});

test("an in-flight set isn't sent twice by overlapping retries", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const save = async () => {
    calls += 1;
    await gate;
  };
  const inFlight = new Set<string>();
  const queue = enqueueSet([], entry(2));
  const first = flushQueue(queue, save, inFlight);
  const second = flushQueue(queue, save, inFlight);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("after edits in the log, the session resumes at the first open set", () => {
  assert.equal(nextOpenSetNumber([1, 3], 4), 2);
  assert.equal(nextOpenSetNumber([1, 2], 3), 3);
  assert.equal(nextOpenSetNumber([1, 2, 3], 3), null);
});

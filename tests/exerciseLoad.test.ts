// What the Workout Log's weight field means per exercise (lib/exerciseLoad.ts).
// Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import { exerciseLoad } from "../lib/exerciseLoad";

const cases: Array<[string, ReturnType<typeof exerciseLoad>, string?]> = [
  // The weight lifted — never the person's body weight.
  ["Goblet Squat", "external"],
  ["Dumbbell Row", "external"],
  ["Single-Arm Dumbbell Row", "external"],
  ["Barbell Back Squat", "external"],
  ["Romanian Deadlift", "external"],
  ["Leg Press", "external"],
  ["Chest Press Machine", "external"],
  ["Seated Cable Row", "external"],
  ["Lat Pulldown", "external"],
  ["Kettlebell Swing", "external"],
  ["Dumbbell Walking Lunges", "external"],
  // Body weight: the field is optional added load.
  ["Push-up", "bodyweight"],
  ["Pull-Up", "bodyweight"],
  ["Bodyweight Squat", "bodyweight"],
  ["Plank", "bodyweight"],
  ["Pull-Up or Assisted Pull-Up", "bodyweight"],
  // Weighted bodyweight moves: still added load on top of the body.
  ["Weighted Pull-up", "bodyweight"],
  ["Weighted Dips", "bodyweight"],
  ["Push-up with a plate", "bodyweight"],
  // Assisted: the counterweight (less is better).
  ["Assisted Pull-up", "assisted"],
  ["Machine Assisted Dip", "assisted"],
  ["Band-Assisted Chin-up", "assisted"],
  ["Resistance Band Pull-Apart", "band"],
  ["Treadmill Walk", "none", "cardio"],
  // Spanish plans.
  ["Sentadilla goblet", "external"],
  ["Remo con mancuerna", "external"],
  ["Press de banca con barra", "external"],
  ["Prensa de piernas", "external"],
  ["Jalón al pecho en polea", "external"],
  ["Flexiones", "bodyweight"],
  ["Dominadas", "bodyweight"],
  ["Fondos en paralelas", "bodyweight"],
  ["Plancha", "bodyweight"],
  ["Zancadas con mancuernas", "external"],
  ["Dominadas lastradas", "bodyweight"],
  ["Dominadas asistidas", "assisted"],
  ["Dominadas o dominadas asistidas", "bodyweight"],
  ["Remo con banda elástica", "band"],
];

for (const [name, expected, category] of cases) {
  test(`${name} -> ${expected}`, () => {
    assert.equal(exerciseLoad({ name, category }), expected);
  });
}

test("plan ids with suffixes read the same as the name", () => {
  assert.equal(exerciseLoad({ id: "goblet-squat-w2", name: "Goblet Squat" }), "external");
  assert.equal(exerciseLoad({ id: "push_up", name: "Push-up" }), "bodyweight");
});

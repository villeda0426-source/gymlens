// Rest-day placement in the plan's order (lib/planSequence.ts) for 3-6
// training days a week, every experience level, both rest preferences.
// Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanSequence, restAfterIndexes, type PlanSequenceItem } from "../lib/planSequence";
import { buildTemplatePlan } from "../shared/buildTemplatePlan";
import type { CoachPlan, CoachSession, RestPreference } from "../lib/coachTrainer";

const LEVELS: CoachPlan["experience_level"][] = ["beginner", "intermediate", "advanced"];

let nextId = 0;
function exercise(name: string, muscles: string[]) {
  nextId += 1;
  return {
    exercise_id: `${name}-${nextId}`,
    name,
    category: "compound" as const,
    primary_muscles: muscles,
    sets: 3,
    rep_range: { min: 8, max: 12 },
    target_rpe: 7.5,
    target_load: "",
    rest_seconds: 90,
    progression_rule: "",
    substitutions: [],
    coach_notes: "",
  };
}

const SESSIONS: Record<string, () => CoachSession> = {
  full: () => ({ day_label: "Full", focus: "Full body", estimated_minutes: 50, exercises: [exercise("squat", ["quads", "glutes"]), exercise("bench", ["chest", "triceps"]), exercise("row", ["back", "biceps"])] }),
  upper: () => ({ day_label: "Upper", focus: "Upper", estimated_minutes: 50, exercises: [exercise("bench", ["chest", "triceps"]), exercise("row", ["back", "biceps"])] }),
  lower: () => ({ day_label: "Lower", focus: "Lower", estimated_minutes: 50, exercises: [exercise("squat", ["quads", "glutes"]), exercise("rdl", ["hamstrings", "glutes"])] }),
  push: () => ({ day_label: "Push", focus: "Push", estimated_minutes: 50, exercises: [exercise("bench", ["chest", "triceps"]), exercise("ohp", ["shoulders", "triceps"])] }),
  pull: () => ({ day_label: "Pull", focus: "Pull", estimated_minutes: 50, exercises: [exercise("row", ["back", "biceps"]), exercise("pullup", ["lats", "biceps"])] }),
  legs: () => ({ day_label: "Legs", focus: "Legs", estimated_minutes: 50, exercises: [exercise("squat", ["quads", "glutes"]), exercise("rdl", ["hamstrings", "glutes"])] }),
};

// Typical splits for each frequency.
const SPLITS: Record<number, string[]> = {
  3: ["upper", "lower", "full"],
  4: ["upper", "lower", "upper", "lower"],
  5: ["upper", "lower", "push", "pull", "legs"],
  6: ["push", "pull", "legs", "push", "pull", "legs"],
};

function plan(days: number, level: CoachPlan["experience_level"], split: string[], rest?: RestPreference): CoachPlan {
  return {
    goal: "",
    goal_type: "general_fitness",
    experience_level: level,
    units: "lbs",
    timeline_weeks: 3,
    days_per_week: days,
    split: "",
    equipment: [],
    constraints: [],
    progression_strategy: "",
    sessions: Array.from({ length: days * 3 }, (_, index) => SESSIONS[split[index % split.length]]()),
    weekly_notes: "",
    safety_flags: [],
    ...(rest ? { rest_preference: rest } : {}),
  };
}

const sequence = (p: CoachPlan) => buildPlanSequence({ plan: p, completedExerciseIds: [], sessionCompletedAt: [] });
const workouts = (items: PlanSequenceItem[]) => items.filter((item) => item.type === "workout");
const pattern = (items: PlanSequenceItem[]) => items.map((item) => (item.type === "rest" ? "R" : "W")).join("");
const restsInWeek = (items: PlanSequenceItem[], week: number) => items.filter((item) => item.type === "rest" && item.week === week).length;

function longestTrainingRun(items: PlanSequenceItem[]): number {
  let run = 0;
  let longest = 0;
  for (const item of items) {
    run = item.type === "workout" ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

for (const days of [3, 4, 5, 6]) {
  for (const level of LEVELS) {
    test(`${days} days/week, ${level}: every workout kept, numbered in order, no rest after every session`, () => {
      const items = sequence(plan(days, level, SPLITS[days]));
      const trained = workouts(items);
      assert.equal(trained.length, days * 3);
      assert.deepEqual(trained.map((item) => (item as any).number), trained.map((_, index) => index + 1));
      // Mixed splits never alternate workout/rest.
      const rests = items.length - trained.length;
      assert.ok(rests < trained.length - 1, `${rests} rests for ${trained.length} workouts`);
      // Each week keeps its frequency: at most 7 - days rests.
      for (const week of [1, 2, 3]) assert.ok(restsInWeek(items, week) <= 7 - days);
      // Consecutive training happens.
      assert.ok(longestTrainingRun(items) >= 2);
    });

    test(`${days} days/week, ${level}, one rest day per week: exactly one rest per week`, () => {
      const items = sequence(plan(days, level, SPLITS[days], "weekly"));
      assert.equal(workouts(items).length, days * 3);
      // Weeks 1 and 2 end in a rest; the plan's last week needs none after it.
      assert.equal(restsInWeek(items, 1), 1);
      assert.equal(restsInWeek(items, 2), 1);
      assert.equal(restsInWeek(items, 3), 0);
      assert.equal(longestTrainingRun(items), days);
    });
  }
}

test("hard same-muscle sessions are split up: full body every day is not stacked", () => {
  const cap = { beginner: 2, intermediate: 3, advanced: 3 };
  for (const level of LEVELS) {
    const items = sequence(plan(4, level, ["full"]));
    assert.ok(longestTrainingRun(items) <= cap[level], `${level}: ${longestTrainingRun(items)} full-body days in a row`);
  }
});

test("upper/lower alternation trains consecutive days with one rest closing the week", () => {
  const rests = restAfterIndexes(plan(4, "intermediate", SPLITS[4]));
  assert.deepEqual([...rests], [3, 7]);
});

// The reported bug: a beginner's default plan (2-3 full-body days) came out
// Workout, Rest, Workout, Rest...
test("a beginner on 2-3 full-body days trains back to back instead of resting after every workout", () => {
  for (const days of [2, 3]) {
    const items = sequence(plan(days, "beginner", ["full"]));
    assert.equal(workouts(items).length, days * 3);
    assert.equal(longestTrainingRun(items), 2, pattern(items));
    assert.ok(!pattern(items).includes("WRWR"), pattern(items));
  }
  // ...and one rest day per week is still there for anyone who wants it.
  const weekly = sequence(plan(3, "beginner", ["full"], "weekly"));
  assert.equal(restsInWeek(weekly, 1), 1);
  assert.equal(longestTrainingRun(weekly), 3);
});

test("a recovery rest mid-week counts as that week's rest day: 3 full-body days get one rest a week", () => {
  for (const level of ["intermediate", "advanced"] as const) {
    const items = sequence(plan(3, level, ["full"]));
    assert.equal(pattern(items), "WWWRWWWRWWW");
  }
});

// Every plan the template engine builds (what Build My Plan shows) — all
// experience levels, 2-6 days, both plan options.
test("template plans never alternate workout/rest and keep to about one rest a week", () => {
  for (const experience of LEVELS) {
    for (const daysPerWeek of [2, 3, 4, 5, 6]) {
      for (const style of ["standard", "alternate"] as const) {
        const built = buildTemplatePlan({
          goal: "hypertrophy",
          daysPerWeek,
          sessionMinutes: 45,
          location: "full_gym",
          experience,
          avoidAreas: [],
          lightModerate: false,
          units: "lbs",
          language: "en",
          style,
        });
        assert.ok(built);
        const weekly = built.sessions.slice(0, daysPerWeek);
        const expanded = { ...built, sessions: Array.from({ length: daysPerWeek * 3 }, (_, index) => weekly[(index % daysPerWeek) % weekly.length]) };
        const items = sequence(expanded);
        const label = `${experience} ${daysPerWeek}d ${style}: ${pattern(items)}`;
        assert.equal(workouts(items).length, daysPerWeek * 3, label);
        assert.ok(!pattern(items).includes("WRWR"), label);
        assert.ok(longestTrainingRun(items) >= 2, label);
        for (const week of [1, 2, 3]) assert.ok(restsInWeek(items, week) <= 2, label);
      }
    }
  }
});

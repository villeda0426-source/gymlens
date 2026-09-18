import assert from "node:assert/strict";
import {
  compactPlanForCoach,
  getCoachTimeoutsForBuild,
  Plan,
  Session,
} from "../server/services/coachTrainerService";
import {
  buildReliableStarterPlan,
  canBuildReliablePlan,
  hasCoachMedicalRedFlag,
} from "../shared/reliableCoach";

function makeSession(index: number): Session {
  return {
    day_label: `Week ${Math.floor(index / 4) + 1} Day ${(index % 4) + 1} - Session`,
    focus: "Regression test",
    estimated_minutes: 45,
    exercises: [],
  };
}

const expandedPlan: Plan = {
  goal: "Build strength",
  goal_type: "strength",
  experience_level: "intermediate",
  units: "lbs",
  timeline_weeks: 3,
  days_per_week: 4,
  split: "Upper / Lower",
  equipment: ["Full gym"],
  constraints: [],
  progression_strategy: "Progress weekly.",
  sessions: Array.from({ length: 12 }, (_, index) => makeSession(index)),
  weekly_notes: "Recover between sessions.",
  safety_flags: [],
};

assert.deepEqual(getCoachTimeoutsForBuild(37), {
  primaryTimeoutMs: 30000,
  fallbackTimeoutMs: 12000,
});
assert.deepEqual(getCoachTimeoutsForBuild(38), {
  primaryTimeoutMs: 85000,
  fallbackTimeoutMs: 20000,
});

const compactPlan = compactPlanForCoach(expandedPlan);
assert.equal(compactPlan.sessions.length, 4);
assert.deepEqual(compactPlan.sessions, expandedPlan.sessions.slice(0, 4));
assert.equal(expandedPlan.sessions.length, 12, "Compaction must not mutate the stored plan.");

assert.equal(canBuildReliablePlan("I want to build muscle 3 days a week with dumbbells at home"), true);
assert.equal(canBuildReliablePlan("hello"), false);
assert.equal(hasCoachMedicalRedFlag("I get chest pain when I train"), true);

const reliablePlan = buildReliableStarterPlan(
  "I am a beginner and want to build muscle 3 days a week with dumbbells at home",
  "lbs"
);
assert.ok(reliablePlan);
assert.equal(reliablePlan.plan.goal_type, "hypertrophy");
assert.equal(reliablePlan.plan.days_per_week, 3);
assert.deepEqual(reliablePlan.plan.equipment, ["Dumbbells", "Bench or stable surface"]);
assert.equal(reliablePlan.plan.sessions.length, 3);
assert.equal(reliablePlan.plan.sessions.every((session) => session.exercises.length === 4), true);
assert.equal(reliablePlan.plan.sessions.flatMap((session) => session.exercises).some((item) => item.name.includes("Swim")), false);

assert.equal(
  buildReliableStarterPlan("I have chest pain and want a 3 day gym plan", "lbs"),
  null,
  "Medical red flags must not produce a workout."
);

console.log("Coach update regression checks passed.");

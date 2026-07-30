import assert from "node:assert/strict";
import {
  compactPlanForCoach,
  getCoachTimeoutsForBuild,
  Plan,
  Session,
} from "../server/services/coachTrainerService";

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

console.log("Coach update regression checks passed.");

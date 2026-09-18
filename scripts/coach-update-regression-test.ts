import assert from "node:assert/strict";
import {
  compactPlanForCoach,
  getCoachTimeoutsForBuild,
  Plan,
  Session,
} from "../server/services/coachTrainerService";
import {
  adjustSessionForToday,
  buildReliableStarterPlan,
  canBuildReliablePlan,
  hasCoachMedicalRedFlag,
  ReliableSession,
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

// Spanish coverage: the deterministic plan must work in Spanish and stay in Spanish.
assert.equal(
  canBuildReliablePlan("Quiero ganar músculo 3 días a la semana con mancuernas en casa"),
  true,
  "Spanish planning requests must reach the deterministic generator."
);
assert.equal(canBuildReliablePlan("hola"), false);
assert.equal(hasCoachMedicalRedFlag("Tengo dolor de pecho cuando entreno"), true);
assert.equal(hasCoachMedicalRedFlag("Me dan mareos al levantar"), true);
assert.equal(hasCoachMedicalRedFlag("Quiero entrenar cuatro días"), false);

const spanishPlan = buildReliableStarterPlan(
  "Soy principiante y quiero ganar músculo 3 días a la semana con mancuernas en casa",
  "kg",
  "es"
);
assert.ok(spanishPlan);
assert.equal(spanishPlan.plan.goal_type, "hypertrophy");
assert.equal(spanishPlan.plan.days_per_week, 3);
assert.equal(spanishPlan.plan.units, "kg");
assert.deepEqual(spanishPlan.plan.equipment, ["Mancuernas", "Banco o superficie estable"]);
assert.equal(spanishPlan.plan.sessions.length, 3);
assert.equal(spanishPlan.plan.sessions[0].day_label.startsWith("Semana 1 Día 1"), true);
assert.equal(
  spanishPlan.plan.sessions.flatMap((session) => session.exercises).every((item) => /[a-záéíóúñ]/i.test(item.name)),
  true
);
const spanishText = JSON.stringify(spanishPlan);
for (const englishOnly of ["Goblet Squat", "Dumbbell Floor Press", "reps in reserve", "Full Body"]) {
  assert.equal(spanishText.includes(englishOnly), false, `Spanish plan must not contain "${englishOnly}".`);
}
assert.equal(
  buildReliableStarterPlan("Tengo dolor de pecho y quiero un plan de 3 días", "kg", "es"),
  null,
  "Spanish medical red flags must not produce a workout."
);

const englishPlan = buildReliableStarterPlan(
  "I am a beginner and want to build muscle 3 days a week with dumbbells at home",
  "lbs",
  "en"
);
assert.ok(englishPlan);
assert.equal(englishPlan.plan.sessions[0].day_label.startsWith("Week 1 Day 1"), true);

// Layer 2: same-day adjustments are deterministic, bounded, and never escalate.
const baseSession: ReliableSession = englishPlan.plan.sessions[0];
const baseline = adjustSessionForToday(baseSession, { readiness: "good", pain: false });
assert.deepEqual(baseline.session, baseSession, "Good readiness with no limits must not change the session.");
assert.deepEqual(baseline.changes, []);

const poor = adjustSessionForToday(baseSession, { readiness: "poor", pain: false });
assert.equal(
  poor.session.exercises.every((item, index) => item.sets <= baseSession.exercises[index].sets),
  true,
  "Poor readiness must never add volume."
);
assert.equal(
  poor.session.exercises.every((item) => item.sets >= (item.category === "compound" ? 2 : 1)),
  true,
  "Set reduction must respect the per-category floor."
);
assert.equal(poor.session.exercises.every((item) => (item.target_rpe ?? 0) <= 6), true);
assert.equal(poor.changes.some((change) => change.code === "sets_reduced"), true);

const painful = adjustSessionForToday(baseSession, { readiness: "good", pain: true });
assert.equal(painful.session.exercises.every((item) => (item.target_rpe ?? 0) <= 6), true);
assert.equal(painful.changes.some((change) => change.code === "pain_guardrail"), true);

const short = adjustSessionForToday(baseSession, { readiness: "good", pain: false, availableMinutes: 20 });
assert.equal(short.session.estimated_minutes <= 20 || short.session.exercises.length === 2, true);
assert.equal(short.session.exercises.length >= 2, true, "Trimming must keep at least two movements.");
assert.equal(short.session.exercises.some((item) => item.category === "compound"), true);

const swapped = adjustSessionForToday(baseSession, {
  readiness: "good",
  pain: false,
  unavailableEquipment: ["dumbbell"],
});
const allowedNames = new Set(
  baseSession.exercises.flatMap((item) => [item.name, ...item.substitutions])
);
assert.equal(
  swapped.session.exercises.every((item) => allowedNames.has(item.name)),
  true,
  "Substitutions must come from the reviewed plan, not from new inventions."
);
assert.equal(
  swapped.session.exercises.every((item) => !/dumbbell/i.test(item.name)),
  true,
  "Unavailable equipment must not remain in the session."
);
assert.equal(swapped.session.exercises.length >= 2, true);

assert.deepEqual(
  adjustSessionForToday(baseSession, { readiness: "poor", pain: true, availableMinutes: 25 }),
  adjustSessionForToday(baseSession, { readiness: "poor", pain: true, availableMinutes: 25 }),
  "Adjustments must be deterministic for identical input."
);
assert.equal(baseSession.exercises[0].sets, englishPlan.plan.sessions[0].exercises[0].sets, "Adjustment must not mutate the stored plan.");

console.log("Coach update regression checks passed.");

import assert from "node:assert/strict";

type CoachResponseLike =
  | { status: "gathering"; message: string }
  | { status: "plan_ready"; summary: string; plan: { sessions: Array<{ day_label: string }> } }
  | { status: "plan_updated" | "reply"; message?: string };
import {
  buildIntakeMessages,
  CoachClient,
  compactPlanForCoach,
  fallbackCoachResponse,
  getCoachTimeoutsForBuild,
  intakeTurn,
  isCoachFallbackEligibleError,
  Plan,
  Session,
  setCoachClientForTests,
} from "../server/services/coachTrainerService";
import {
  adjustSessionForToday,
  AdjustOutcome,
  buildReliableStarterPlan,
  canBuildReliablePlan,
  detectReliableLanguage,
  hasCoachMedicalRedFlag,
  ReliableExercise,
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

// Provider failure must answer in the conversation's language, so a server
// fallback cannot replace a visible Spanish plan with an English one.
assert.equal(detectReliableLanguage('CONTEXT: {"mode":"intake","units":"kg","language":"es"}'), "es");
assert.equal(detectReliableLanguage('CONTEXT: {"mode":"intake","units":"lbs","language":"en"}\n\nbuild muscle'), "en");
assert.equal(detectReliableLanguage("Quiero entrenar tres días con mancuernas"), "es");
assert.equal(detectReliableLanguage("I want to train three days with dumbbells"), "en");

const spanishFallback = fallbackCoachResponse([
  {
    role: "user",
    content:
      'CONTEXT: {"mode":"intake","units":"kg","language":"es"}\n\nSoy principiante y quiero ganar músculo 3 días a la semana con mancuernas en casa',
  },
]);
assert.equal(spanishFallback.status, "plan_ready");
if (spanishFallback.status === "plan_ready") {
  assert.equal(spanishFallback.plan.units, "kg");
  assert.equal(spanishFallback.plan.sessions[0].day_label.startsWith("Semana 1 Día 1"), true);
  const text = JSON.stringify(spanishFallback);
  for (const englishOnly of ["Goblet Squat", "reps in reserve", "Week 1 Day", "Full Body"]) {
    assert.equal(text.includes(englishOnly), false, `Spanish provider fallback must not contain "${englishOnly}".`);
  }
}

const spanishRedFlagFallback = fallbackCoachResponse([
  { role: "user", content: 'CONTEXT: {"mode":"intake","units":"kg","language":"es"}\n\nTengo dolor de pecho al entrenar' },
]);
assert.equal(spanishRedFlagFallback.status, "gathering");
if (spanishRedFlagFallback.status === "gathering") {
  assert.equal(spanishRedFlagFallback.message.includes("autorización médica"), true);
}

const spanishInferredFallback = fallbackCoachResponse([
  { role: "user", content: 'CONTEXT: {"mode":"intake","units":"kg"}\n\nQuiero ganar músculo 3 días a la semana con mancuernas en casa' },
]);
assert.equal(spanishInferredFallback.status, "plan_ready", "Spanish must be inferred when no language marker is present.");

const englishFallback = fallbackCoachResponse([
  {
    role: "user",
    content: 'CONTEXT: {"mode":"intake","units":"lbs","language":"en"}\n\nI am a beginner and want to build muscle 3 days a week with dumbbells at home',
  },
]);
assert.equal(englishFallback.status, "plan_ready");
if (englishFallback.status === "plan_ready") {
  assert.equal(englishFallback.plan.sessions[0].day_label.startsWith("Week 1 Day 1"), true);
}

// A blocked first movement with no safe substitution must be dropped when the
// remaining movements already satisfy the floor.
const blockedFirst: ReliableSession = {
  day_label: "Test Day",
  focus: "Test",
  estimated_minutes: 40,
  exercises: [
    {
      ...(baseSession.exercises[0] as ReliableExercise),
      exercise_id: "machine-only-press",
      name: "Machine Only Press",
      category: "compound",
      substitutions: ["Machine Alternate Press"],
    },
    { ...(baseSession.exercises[1] as ReliableExercise), exercise_id: "safe-a", name: "Bodyweight Squat", substitutions: ["Chair Squat"] },
    { ...(baseSession.exercises[2] as ReliableExercise), exercise_id: "safe-b", name: "Towel Isometric Row", substitutions: ["Bird Dog"] },
  ],
};
const blockedResult = adjustSessionForToday(blockedFirst, {
  readiness: "good",
  pain: false,
  unavailableEquipment: ["machine"],
});
assert.equal(
  blockedResult.session.exercises.some((item) => /machine/i.test(item.name)),
  false,
  "A blocked first movement with no safe substitution must be dropped."
);
assert.equal(blockedResult.session.exercises.length, 2);
assert.equal(
  blockedResult.changes.some(
    (change) => change.code === "exercise_removed" && change.exercise_id === "machine-only-press" && change.reason === "equipment"
  ),
  true,
  "Equipment removals must be explained as equipment, not time."
);
assert.equal(
  short.changes.every((change) => change.code !== "exercise_removed" || change.reason === "time"),
  true,
  "Time trimming must be explained as time."
);
assert.equal(
  short.changes.some((change) => change.code === "exercise_removed" && change.reason === "time"),
  true,
  "The 20-minute case must report at least one time-driven removal."
);

// When dropping would fall below the floor, the blocked movement is kept
// rather than leaving the user with no session at all.
const blockedMost = adjustSessionForToday(
  { ...blockedFirst, exercises: blockedFirst.exercises.slice(0, 2) },
  { readiness: "good", pain: false, unavailableEquipment: ["machine", "bodyweight squat"] }
);
assert.equal(blockedMost.session.exercises.length >= 1, true);

// Availability outranks the movement floor: a session must never hand back a
// movement the user cannot do today.
const twoBlocked = adjustSessionForToday(blockedFirst, {
  readiness: "good",
  pain: false,
  // "squat" also blocks the Chair Squat substitution, leaving one viable movement.
  unavailableEquipment: ["machine", "squat"],
});
assert.equal(twoBlocked.session.exercises.length, 1, "Only viable movements may be returned.");
assert.equal(twoBlocked.session.exercises.every((item) => !/machine|squat/i.test(item.name)), true);
assert.equal(twoBlocked.outcome, "insufficient_equipment" as AdjustOutcome);

const allBlocked = adjustSessionForToday(blockedFirst, {
  readiness: "good",
  pain: false,
  unavailableEquipment: ["machine", "squat", "towel", "bird dog"],
});
assert.equal(allBlocked.session.exercises.length, 0, "Zero viable movements must return an empty session.");
assert.equal(allBlocked.outcome, "insufficient_equipment" as AdjustOutcome);
assert.equal(allBlocked.changes.filter((change) => change.code === "exercise_removed").length, 3);
assert.equal(blockedFirst.exercises.length, 3, "Adjustment must not mutate the source session.");
assert.equal(
  adjustSessionForToday(blockedFirst, { readiness: "good", pain: false, unavailableEquipment: ["machine"] }).outcome,
  "ok" as AdjustOutcome
);

// End-to-end payload: the real client fields must survive into the server
// fallback, including on an ambiguous short Spanish request.
const clientIntakeMessages = buildIntakeMessages("kg", [], "quiero más", "es");
assert.equal(clientIntakeMessages.length, 1);
assert.equal(clientIntakeMessages[0].content.includes('"language":"es"'), true, "The intake payload must carry the language.");
const ambiguousSpanishFallback = fallbackCoachResponse(clientIntakeMessages);
assert.equal(ambiguousSpanishFallback.status, "gathering");
if (ambiguousSpanishFallback.status === "gathering") {
  assert.equal(
    ambiguousSpanishFallback.message.includes("Cuéntame tu objetivo"),
    true,
    "An ambiguous Spanish request must get the Spanish gathering reply, not English."
  );
}

const englishIntakeMessages = buildIntakeMessages("lbs", [], "i want more", "en");
const ambiguousEnglishFallback = fallbackCoachResponse(englishIntakeMessages);
assert.equal(ambiguousEnglishFallback.status, "gathering");
if (ambiguousEnglishFallback.status === "gathering") {
  assert.equal(ambiguousEnglishFallback.message.includes("Tell me your goal"), true);
}

// Provider failures the user must survive: timeout, malformed output, 5xx/429.
const providerError = (init: { status?: number; name?: string; message: string }) => {
  const error = new Error(init.message);
  if (init.name) error.name = init.name;
  if (init.status) (error as Error & { status?: number }).status = init.status;
  return error;
};
for (const error of [
  providerError({ message: "Coach response timed out for claude-sonnet-4-6." }),
  providerError({ message: "Unexpected token < in JSON at position 0" }),
  new SyntaxError("Unexpected end of JSON input"),
  providerError({ status: 500, message: "Internal server error" }),
  providerError({ status: 529, message: "Overloaded" }),
  providerError({ status: 429, message: "Rate limit" }),
  providerError({ name: "APIConnectionError", message: "fetch failed" }),
  providerError({ message: "ANTHROPIC_API_KEY is not configured on the server." }),
]) {
  assert.equal(isCoachFallbackEligibleError(error), true, `Must fall back for: ${error.message}`);
}
assert.equal(isCoachFallbackEligibleError(providerError({ status: 401, message: "invalid x-api-key" })), false);
assert.equal(isCoachFallbackEligibleError(providerError({ status: 400, message: "bad request" })), false);

// A timed-out attempt must abort the paid request and must not retry silently.
async function assertTimeoutAbortsWithoutRetries() {
  const attempts: Array<{ model: string; maxRetries?: number; aborted: boolean }> = [];
  const hangingClient: CoachClient = {
    messages: {
      create: (params, options) =>
        new Promise((_resolve, reject) => {
          const attempt = { model: String(params.model), maxRetries: options?.maxRetries, aborted: false };
          attempts.push(attempt);
          options?.signal?.addEventListener("abort", () => {
            attempt.aborted = true;
            reject(providerError({ name: "AbortError", message: "Request was aborted." }));
          });
        }),
    },
  };

  setCoachClientForTests(hangingClient);
  try {
    const response = await intakeTurn(
      "kg",
      [],
      "Soy principiante y quiero ganar músculo 3 días a la semana con mancuernas en casa",
      { primaryTimeoutMs: 20, fallbackTimeoutMs: 20 },
      "es"
    );
    assert.equal(response.status, "plan_ready", "A hung provider must still return the deterministic plan.");
    if (response.status === "plan_ready") {
      assert.equal(response.plan.sessions[0].day_label.startsWith("Semana 1 Día 1"), true, "The survival plan must stay in Spanish.");
    }
  } finally {
    setCoachClientForTests(null);
  }

  assert.equal(attempts.length, 2, `Expected one primary attempt and one fallback attempt, saw ${attempts.length}.`);
  assert.equal(attempts.every((attempt) => attempt.aborted), true, "Every timed-out attempt must abort its request.");
  assert.equal(attempts.every((attempt) => attempt.maxRetries === 0), true, "Attempts must disable hidden SDK retries.");
  assert.notEqual(attempts[0].model, attempts[1].model, "The fallback attempt must use the cheaper fallback model.");
}

// Malformed output must also cost at most two paid attempts.
async function assertMalformedCostsAtMostTwoAttempts() {
  const models: string[] = [];
  const malformedClient: CoachClient = {
    messages: {
      create: async (params) => {
        models.push(String(params.model));
        return { content: [{ type: "text", text: "not json at all" }] } as never;
      },
    },
  };

  setCoachClientForTests(malformedClient);
  try {
    const response = await intakeTurn(
      "lbs",
      [],
      "I am a beginner and want to build muscle 3 days a week with dumbbells at home",
      { primaryTimeoutMs: 200, fallbackTimeoutMs: 200 },
      "en"
    );
    assert.equal(response.status, "plan_ready", "Malformed output must still return the deterministic plan.");
  } finally {
    setCoachClientForTests(null);
  }

  assert.equal(models.length, 2, `Malformed output must cost at most two attempts, saw ${models.length}.`);
  assert.notEqual(models[0], models[1], "The single retry must use the cheaper fallback model.");
}

// Every change reason and Adjust Today control must exist in both languages,
// so the no-AI path can never render a raw key.
const en = require("../locales/en.json") as { trainer: Record<string, unknown> };
const es = require("../locales/es.json") as { trainer: Record<string, unknown> };
const requiredCoachKeys = [
  "coach_adjust_sets_reduced",
  "coach_adjust_effort_capped",
  "coach_adjust_substituted",
  "coach_adjust_removed_time",
  "coach_adjust_removed_equipment",
  "coach_adjust_pain_guardrail",
  "coach_adjust_title",
  "coach_adjust_readiness",
  "coach_adjust_readiness_good",
  "coach_adjust_readiness_okay",
  "coach_adjust_readiness_poor",
  "coach_adjust_time",
  "coach_adjust_time_full",
  "coach_adjust_time_minutes",
  "coach_adjust_pain",
  "coach_adjust_heading",
  "coach_adjust_no_changes",
  "coach_adjust_insufficient",
  "coach_adjust_unavailable",
  "coach_adjust_unavailable_placeholder",
  "coach_adjust_use_today",
  "coach_adjust_keep",
  "coach_adjust_cancel",
  "coach_adjust_applied_today",
  "coach_adjust_kept",
  "coach_adjust_no_ai",
  "coach_adjust_needs_plan",
  "coach_medical_stop",
  "coach_medical_notice",
];
// "{{minutes}} min" is identical in both languages; everything else must differ.
const identicalByDesign = new Set(["coach_adjust_time_minutes"]);
for (const key of requiredCoachKeys) {
  assert.equal(typeof en.trainer[key], "string", `Missing English string: trainer.${key}`);
  assert.equal(typeof es.trainer[key], "string", `Missing Spanish string: trainer.${key}`);
  if (!identicalByDesign.has(key)) {
    assert.notEqual(en.trainer[key], es.trainer[key], `trainer.${key} is not translated.`);
  }
}

// Storage must not mix languages when a 3-week Spanish plan is expanded.
import { normalizePlanTimeline } from "../shared/planTimeline";

const spanishStored = normalizePlanTimeline(spanishPlan.plan as never) as unknown as Plan;
assert.equal(spanishStored.sessions.length, spanishPlan.plan.days_per_week * spanishPlan.plan.timeline_weeks);
assert.equal(
  spanishStored.sessions.every((session) => /^Semana \d+ Día \d+ - /.test(session.day_label)),
  true,
  "Expanded Spanish weeks must use Spanish labels."
);
assert.equal(
  spanishStored.sessions.some((session) => /week|day/i.test(session.day_label)),
  false,
  "No English week or day prefix may survive storage."
);
assert.equal(
  spanishStored.sessions.some((session) => /Semana \d+ Día \d+ - Semana/i.test(session.day_label)),
  false,
  "Labels must not be double-prefixed."
);
assert.deepEqual(
  spanishStored.sessions[0].exercises.map((item) => item.exercise_id),
  spanishPlan.plan.sessions[0].exercises.map((item) => item.exercise_id),
  "Week 1 exercise IDs must stay stable."
);
// IDs repeat across days by design (the same movement appears twice a week),
// so uniqueness is asserted within a session, and week suffixes must separate weeks.
for (const session of spanishStored.sessions) {
  const ids = session.exercises.map((item) => item.exercise_id);
  assert.equal(new Set(ids).size, ids.length, `Duplicate exercise IDs inside ${session.day_label}`);
}
// Stable-ID contract: week 1 keeps the template IDs; later weeks are exactly
// the template ID plus "-wN", so a repeated movement stays consistent.
const templateIds = spanishPlan.plan.sessions.map((session) => session.exercises.map((item) => item.exercise_id));
spanishStored.sessions.forEach((session, index) => {
  const week = Math.floor(index / spanishPlan.plan.days_per_week) + 1;
  const template = templateIds[index % spanishPlan.plan.days_per_week];
  const expected = week === 1 ? template : template.map((id) => `${id}-w${week}`);
  assert.deepEqual(
    session.exercises.map((item) => item.exercise_id),
    expected,
    `Unexpected IDs in ${session.day_label}`
  );
});

const englishStored = normalizePlanTimeline(englishPlan.plan as never) as unknown as Plan;
assert.equal(
  englishStored.sessions.every((session) => /^Week \d+ Day \d+ - /.test(session.day_label)),
  true,
  "English plans must keep English labels."
);

// Route boundary: the exact body the client sends must produce a Spanish
// fallback when the provider fails. This covers the trainer.tsx -> route gap.
async function assertRouteBoundaryKeepsSpanish() {
  // The route module builds a Supabase client at import time; these placeholders
  // keep the boundary test offline and never reach the network.
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "regression-placeholder";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runCoachRequest } = require("../server/routes/coach-trainer") as {
    runCoachRequest: (req: unknown, options?: { primaryTimeoutMs: number; fallbackTimeoutMs: number }) => Promise<CoachResponseLike>;
  };
  const failingClient: CoachClient = {
    messages: {
      create: async () => {
        throw Object.assign(new Error("Overloaded"), { status: 529 });
      },
    },
  };

  setCoachClientForTests(failingClient);
  try {
    const spanish = await runCoachRequest(
      { body: { mode: "intake", units: "kg", language: "es", history: [], userMessage: "quiero más" } } as never,
      { primaryTimeoutMs: 200, fallbackTimeoutMs: 200 }
    );
    assert.equal(spanish.status, "gathering");
    if (spanish.status === "gathering") {
      assert.equal(
        spanish.message.includes("Cuéntame tu objetivo"),
        true,
        "A Spanish request that fails at the provider must answer in Spanish."
      );
    }

    const english = await runCoachRequest(
      { body: { mode: "intake", units: "lbs", language: "en", history: [], userMessage: "i want more" } } as never,
      { primaryTimeoutMs: 200, fallbackTimeoutMs: 200 }
    );
    assert.equal(english.status, "gathering");
    if (english.status === "gathering") {
      assert.equal(english.message.includes("Tell me your goal"), true);
    }

    const spanishPlanRequest = await runCoachRequest(
      {
        body: {
          mode: "intake",
          units: "kg",
          language: "es",
          history: [],
          userMessage: "Soy principiante y quiero ganar músculo 3 días a la semana con mancuernas en casa",
        },
      } as never,
      { primaryTimeoutMs: 200, fallbackTimeoutMs: 200 }
    );
    assert.equal(spanishPlanRequest.status, "plan_ready");
    if (spanishPlanRequest.status === "plan_ready") {
      assert.equal(spanishPlanRequest.plan.sessions[0].day_label.startsWith("Semana 1 Día 1"), true);
    }
  } finally {
    setCoachClientForTests(null);
  }
}

// Sequential: both tests share the injected provider client.
(async () => {
  await assertTimeoutAbortsWithoutRetries();
  await assertMalformedCostsAtMostTwoAttempts();
  await assertRouteBoundaryKeepsSpanish();
})()
  .then(() => {
    console.log("Coach update regression checks passed.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

import { adaptPlan, intakeTurn, isPlan, Plan } from "../server/services/coachTrainerService";
import { evaluateWorkoutFeedback, WorkoutFeedback } from "../lib/coachingEngine";

type Language = "en" | "es";
type Scenario = {
  id: string;
  days: number;
  units: "kg" | "lbs";
  prompt: Record<Language, string>;
  expectsSafetyFlag?: boolean;
  maxMinutes?: number;
};

const scenarios: Scenario[] = [
  {
    id: "beginner-general-fitness",
    days: 3,
    units: "lbs",
    maxMinutes: 55,
    prompt: {
      en: "I am a complete beginner. I want general fitness and confidence using gym machines. I can train 3 days per week for 45-55 minutes at a full commercial gym. I use pounds and have no injuries or pain.",
      es: "Soy principiante total. Quiero mejorar mi condición física general y sentirme con confianza usando máquinas. Puedo entrenar 3 días por semana durante 45-55 minutos en un gimnasio completo. Uso libras y no tengo lesiones ni dolor.",
    },
  },
  {
    id: "returning-strength",
    days: 4,
    units: "lbs",
    maxMinutes: 70,
    prompt: {
      en: "I am returning after a year away. My goal is to rebuild strength. I can train 4 days a week for up to 70 minutes in a full gym. I use pounds. No current injuries, but keep the first week conservative.",
      es: "Regreso después de un año sin entrenar. Mi meta es recuperar fuerza. Puedo entrenar 4 días por semana hasta 70 minutos en un gimnasio completo. Uso libras. No tengo lesiones actuales, pero quiero una primera semana conservadora.",
    },
  },
  {
    id: "short-fat-loss",
    days: 3,
    units: "kg",
    maxMinutes: 30,
    prompt: {
      en: "My goal is gradual fat loss and better conditioning. I am a beginner and have only 30 minutes, 3 days per week. I have dumbbells, cables, treadmill, and bike. I use kilograms and have no injuries. I do not want an extreme diet or extreme workouts.",
      es: "Mi meta es perder grasa gradualmente y mejorar mi condición. Soy principiante y solo tengo 30 minutos, 3 días por semana. Tengo mancuernas, poleas, caminadora y bicicleta. Uso kilogramos y no tengo lesiones. No quiero dietas ni entrenamientos extremos.",
    },
  },
  {
    id: "home-limited-equipment",
    days: 3,
    units: "kg",
    maxMinutes: 45,
    prompt: {
      en: "I am an intermediate exerciser training at home for muscle and general strength. I have adjustable dumbbells, a bench, and resistance bands only. I can train 3 days per week for 45 minutes, use kilograms, and have no pain or limitations.",
      es: "Tengo experiencia intermedia y entreno en casa para ganar músculo y fuerza general. Solo tengo mancuernas ajustables, banco y bandas. Puedo entrenar 3 días por semana durante 45 minutos, uso kilogramos y no tengo dolor ni limitaciones.",
    },
  },
  {
    id: "machines-only",
    days: 4,
    units: "lbs",
    maxMinutes: 60,
    prompt: {
      en: "I am a beginner who wants hypertrophy but I am not comfortable with barbells. Build a machines-only plan for a full commercial gym, 4 days per week, 60 minutes maximum. I use pounds and have no injuries.",
      es: "Soy principiante y quiero ganar músculo, pero no me siento cómodo con barras. Crea un plan solo con máquinas para un gimnasio completo, 4 días por semana, máximo 60 minutos. Uso libras y no tengo lesiones.",
    },
  },
  {
    id: "knee-limitation",
    days: 3,
    units: "lbs",
    maxMinutes: 50,
    expectsSafetyFlag: true,
    prompt: {
      en: "I am a beginner seeking general fitness 3 days per week for 50 minutes in a full gym. I use pounds. I have ongoing left knee pain during deep bending and have not been medically evaluated. Avoid provoking it and tell me when professional evaluation is appropriate.",
      es: "Soy principiante y busco condición física general 3 días por semana durante 50 minutos en un gimnasio completo. Uso libras. Tengo dolor continuo en la rodilla izquierda al flexionarla profundamente y no he recibido evaluación médica. Evita provocarlo e indica cuándo corresponde consultar a un profesional.",
    },
  },
  {
    id: "missed-week-schedule",
    days: 2,
    units: "kg",
    maxMinutes: 45,
    prompt: {
      en: "I am an intermediate user who keeps missing workouts because of an unpredictable work schedule. I want strength and consistency with the minimum effective plan: 2 full-gym days per week, 45 minutes, kilograms, no injuries.",
      es: "Tengo experiencia intermedia, pero pierdo entrenamientos por un horario laboral impredecible. Quiero fuerza y constancia con el plan mínimo efectivo: 2 días por semana en gimnasio completo, 45 minutos, kilogramos, sin lesiones.",
    },
  },
  {
    id: "older-returning-user",
    days: 3,
    units: "lbs",
    maxMinutes: 50,
    prompt: {
      en: "I am 62 and returning to exercise after several years. I want strength, balance, and confidence. I can use a full gym 3 days weekly for 50 minutes, use pounds, and have no diagnosed injuries or current pain. Start conservatively.",
      es: "Tengo 62 años y regreso al ejercicio después de varios años. Quiero fuerza, equilibrio y confianza. Puedo usar un gimnasio completo 3 días por semana durante 50 minutos, uso libras y no tengo lesiones diagnosticadas ni dolor actual. Comienza de forma conservadora.",
    },
  },
  {
    id: "endurance-plus-strength",
    days: 4,
    units: "kg",
    maxMinutes: 60,
    prompt: {
      en: "I am intermediate and want to improve 5K endurance without losing strength. I have a full gym and treadmill, can train 4 days per week for 60 minutes, use kilograms, and have no injuries.",
      es: "Tengo nivel intermedio y quiero mejorar mi resistencia para 5 km sin perder fuerza. Tengo gimnasio completo y caminadora, puedo entrenar 4 días por semana durante 60 minutos, uso kilogramos y no tengo lesiones.",
    },
  },
  {
    id: "bodyweight-travel",
    days: 3,
    units: "kg",
    maxMinutes: 35,
    prompt: {
      en: "I travel every week and need a beginner bodyweight plan for general fitness. I can train 3 days for 30-35 minutes in a hotel room, have no equipment, use kilograms, and have no injuries.",
      es: "Viajo cada semana y necesito un plan principiante con peso corporal para condición física general. Puedo entrenar 3 días durante 30-35 minutos en una habitación de hotel, no tengo equipo, uso kilogramos y no tengo lesiones.",
    },
  },
];

function deterministicFeedbackChecks(plan: Plan, language: Language) {
  const session = plan.sessions[0];
  const ids = session.exercises.map((exercise) => exercise.exercise_id);
  const base: WorkoutFeedback = {
    workoutId: "controlled-baseline-1",
    sessionLabel: session.day_label,
    completedAt: new Date().toISOString(),
    completedExerciseIds: ids,
    totalExerciseCount: ids.length,
    difficulty: 3,
    energy: 4,
    pain: 0,
  };
  const first = evaluateWorkoutFeedback(plan, [], base, language);
  const progression = evaluateWorkoutFeedback(plan, [base], { ...base, workoutId: "controlled-baseline-2" }, language);
  const highEffort = evaluateWorkoutFeedback(plan, [], { ...base, workoutId: "controlled-high-effort", difficulty: 5 }, language);
  const pain = evaluateWorkoutFeedback(plan, [], { ...base, workoutId: "controlled-pain", pain: 3, painArea: language === "es" ? "rodilla" : "knee" }, language);
  const complete = evaluateWorkoutFeedback(plan, [], { ...base, workoutId: "controlled-plan-complete", planComplete: true }, language);
  return {
    firstSuccessHeld: first.source === "rules" && !first.requiresUserConfirmation,
    secondSuccessProgressed: progression.source === "rules" && progression.changes.length > 0,
    highEffortHeld: highEffort.source === "rules" && highEffort.changes.length > 0,
    painEscalated: pain.source === "ai" && pain.requiresUserConfirmation,
    planCompletionEscalated: complete.source === "ai" && complete.requiresUserConfirmation,
  };
}

function qualityChecks(plan: Plan, scenario: Scenario, language: Language) {
  const exercises = plan.sessions.flatMap((session) => session.exercises);
  const ids = exercises.map((exercise) => exercise.exercise_id);
  const text = JSON.stringify(plan).toLowerCase();
  return {
    validPlanSchema: isPlan(plan),
    correctUnits: plan.units === scenario.units,
    correctTimeline: plan.timeline_weeks === 3,
    correctFrequency: plan.days_per_week === scenario.days && plan.sessions.length === scenario.days,
    mobilePlanSize: plan.sessions.length <= 4 && plan.sessions.every((session) => session.exercises.length <= 5),
    stableUniqueExerciseIds: ids.length === new Set(ids).size && ids.every(Boolean),
    validExercisePrescription: exercises.every((exercise) =>
      exercise.sets > 0 &&
      exercise.rep_range.min > 0 &&
      exercise.rep_range.max >= exercise.rep_range.min &&
      exercise.rest_seconds >= 0 &&
      Boolean(exercise.progression_rule) &&
      Boolean(exercise.coach_notes)
    ),
    respectsSessionDuration: scenario.maxMinutes === undefined || plan.sessions.every((session) => session.estimated_minutes <= scenario.maxMinutes! + 5),
    safetyFlagPresentWhenExpected: !scenario.expectsSafetyFlag || plan.safety_flags.length > 0 || text.includes("professional") || text.includes("médic"),
    spanishOutputWhenRequested: language !== "es" || ["semana", "entren", "progres", "descanso"].some((word) => text.includes(word)),
    feedbackEngine: deterministicFeedbackChecks(plan, language),
  };
}

async function runOne(scenario: Scenario, language: Language) {
  const startedAt = Date.now();
  try {
    const response = await intakeTurn(scenario.units, [], scenario.prompt[language], language, {
      primaryTimeoutMs: 110_000,
      fallbackTimeoutMs: 25_000,
    });
    if (response.status !== "plan_ready") {
      return { scenario: scenario.id, language, status: response.status, passed: false, latencyMs: Date.now() - startedAt, response };
    }
    const checks = qualityChecks(response.plan, scenario, language);
    const flatChecks = [
      ...Object.entries(checks).filter(([, value]) => typeof value === "boolean").map(([key, value]) => ({ key, value })),
      ...Object.entries(checks.feedbackEngine).map(([key, value]) => ({ key: `feedbackEngine.${key}`, value })),
    ];
    return {
      scenario: scenario.id,
      language,
      status: response.status,
      passed: flatChecks.every((check) => check.value),
      failedChecks: flatChecks.filter((check) => !check.value).map((check) => check.key),
      latencyMs: Date.now() - startedAt,
      summary: response.summary,
      checks,
      plan: response.plan,
    };
  } catch (error: any) {
    return { scenario: scenario.id, language, status: "error", passed: false, latencyMs: Date.now() - startedAt, error: error?.message || String(error) };
  }
}

async function main() {
  const jobs = scenarios.flatMap((scenario) => (["en", "es"] as Language[]).map((language) => ({ scenario, language })));
  const results: any[] = [];
  const concurrency = 2;
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(({ scenario, language }) => runOne(scenario, language)));
    results.push(...batchResults);
    for (const result of batchResults) {
      console.log(`${result.passed ? "PASS" : "FAIL"} ${result.scenario} [${result.language}] ${result.latencyMs}ms${result.failedChecks?.length ? ` — ${result.failedChecks.join(", ")}` : result.error ? ` — ${result.error}` : ""}`);
    }
  }

  const eligibleForAdapt = results.filter((result) => result.status === "plan_ready").slice(0, 4);
  const adaptationResults = [];
  for (const result of eligibleForAdapt) {
    const plan = result.plan as Plan;
    const lastSession = plan.sessions[plan.sessions.length - 1];
    const feedback: WorkoutFeedback = {
      workoutId: `controlled-complete-${result.scenario}-${result.language}`,
      sessionLabel: lastSession.day_label,
      completedAt: new Date().toISOString(),
      completedExerciseIds: lastSession.exercises.map((exercise) => exercise.exercise_id),
      totalExerciseCount: lastSession.exercises.length,
      difficulty: 3,
      energy: 4,
      pain: 0,
      notes: result.language === "es" ? "El bloque fue manejable y quiero progresar gradualmente." : "The block was manageable and I want to progress gradually.",
      planComplete: true,
    };
    const startedAt = Date.now();
    try {
      const adapted = await adaptPlan(plan.units, plan, { latest_feedback: feedback }, result.language, {
        primaryTimeoutMs: 110_000,
        fallbackTimeoutMs: 25_000,
      });
      const passed = adapted.status === "plan_updated" && isPlan(adapted.plan) && adapted.changes.length > 0;
      adaptationResults.push({ scenario: result.scenario, language: result.language, passed, latencyMs: Date.now() - startedAt, response: adapted });
      console.log(`${passed ? "PASS" : "FAIL"} full-plan-adaptation ${result.scenario} [${result.language}] ${Date.now() - startedAt}ms`);
    } catch (error: any) {
      adaptationResults.push({ scenario: result.scenario, language: result.language, passed: false, latencyMs: Date.now() - startedAt, error: error?.message || String(error) });
      console.log(`FAIL full-plan-adaptation ${result.scenario} [${result.language}] — ${error?.message || error}`);
    }
  }

  const passedPlans = results.filter((result) => result.passed).length;
  const passedAdaptations = adaptationResults.filter((result) => result.passed).length;
  const report = {
    generatedAt: new Date().toISOString(),
    model: process.env.OPENAI_COACH_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
    syntheticDataOnly: true,
    totals: {
      planScenarios: results.length,
      passedPlans,
      planPassRate: results.length ? passedPlans / results.length : 0,
      adaptationScenarios: adaptationResults.length,
      passedAdaptations,
      adaptationPassRate: adaptationResults.length ? passedAdaptations / adaptationResults.length : 0,
    },
    results,
    adaptationResults,
  };
  console.log(`SUMMARY ${passedPlans}/${results.length} plan scenarios passed; ${passedAdaptations}/${adaptationResults.length} full-plan adaptations passed; model=${report.model}`);
  console.log(`LATENCIES_MS ${results.map((result) => `${result.scenario}:${result.language}=${result.latencyMs}`).join(" ")}`);
}

void main();

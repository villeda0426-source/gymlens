export type CoachingUnits = "kg" | "lbs";
type CoachingExercise = {
  exercise_id: string;
  name: string;
  category: "compound" | "accessory" | "warmup" | "mobility" | "cardio";
  primary_muscles: string[];
  sets: number;
  rep_range: { min: number; max: number };
  target_rpe: number | null;
  target_load: string;
  rest_seconds: number;
  tempo?: string | null;
  progression_rule: string;
  substitutions: string[];
  coach_notes: string;
};
type CoachSession = { day_label: string; focus: string; estimated_minutes: number; exercises: CoachingExercise[] };
export type CoachingPlan = {
  goal: string;
  goal_type: "strength" | "hypertrophy" | "fat_loss" | "endurance" | "general_fitness" | "sport_specific";
  experience_level: "beginner" | "intermediate" | "advanced";
  units: CoachingUnits;
  timeline_weeks: number;
  days_per_week: number;
  split: string;
  equipment: string[];
  constraints: string[];
  progression_strategy: string;
  sessions: CoachSession[];
  weekly_notes: string;
  safety_flags: string[];
};

export type WorkoutFeedback = {
  workoutId: string;
  sessionLabel: string;
  completedAt: string;
  completedExerciseIds: string[];
  totalExerciseCount: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  pain: 0 | 1 | 2 | 3 | 4 | 5;
  painArea?: string;
  notes?: string;
  planComplete?: boolean;
};

export type CoachingSummary = {
  units: CoachingUnits;
  goal: string;
  experienceLevel: CoachingPlan["experience_level"];
  schedule: string;
  adherence: number;
  averageDifficulty: number;
  averageEnergy: number;
  painReports: number;
  completedWorkouts: number;
  recentSessionLabels: string[];
  activeConcerns: string[];
};

export type CoachingDecision = {
  source: "rules" | "ai";
  reason: string;
  requiresUserConfirmation: boolean;
  changes: string[];
  plan: CoachingPlan;
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export function buildCoachingSummary(plan: CoachingPlan, feedback: WorkoutFeedback[]): CoachingSummary {
  const recent = feedback.slice(-8);
  const adherenceValues = recent.map((entry) =>
    entry.totalExerciseCount > 0
      ? Math.min(1, entry.completedExerciseIds.length / entry.totalExerciseCount)
      : 0
  );
  const concerns: string[] = [];
  if (recent.some((entry) => entry.pain >= 2)) concerns.push("Pain or discomfort reported");
  if (recent.length >= 2 && average(recent.slice(-2).map((entry) => entry.difficulty)) >= 4.5) {
    concerns.push("Repeated very difficult sessions");
  }
  if (recent.length >= 3 && average(adherenceValues.slice(-3)) < 0.65) concerns.push("Low recent adherence");
  if (recent.length >= 2 && average(recent.slice(-2).map((entry) => entry.energy)) <= 1.5) {
    concerns.push("Repeated low energy");
  }

  return {
    units: plan.units,
    goal: plan.goal,
    experienceLevel: plan.experience_level,
    schedule: `${plan.days_per_week} days/week · ${plan.split}`,
    adherence: average(adherenceValues),
    averageDifficulty: average(recent.map((entry) => entry.difficulty)),
    averageEnergy: average(recent.map((entry) => entry.energy)),
    painReports: recent.filter((entry) => entry.pain > 0).length,
    completedWorkouts: feedback.length,
    recentSessionLabels: recent.map((entry) => entry.sessionLabel),
    activeConcerns: concerns,
  };
}

function appendNote(plan: CoachingPlan, note: string): CoachingPlan {
  const weeklyNotes = plan.weekly_notes.includes(note)
    ? plan.weekly_notes
    : `${plan.weekly_notes.trim()} ${note}`.trim();
  return { ...plan, weekly_notes: weeklyNotes };
}

function isMatchingSession(session: CoachSession, feedback: WorkoutFeedback) {
  return session.day_label === feedback.sessionLabel;
}

export function evaluateWorkoutFeedback(
  plan: CoachingPlan,
  history: WorkoutFeedback[],
  latest: WorkoutFeedback,
  language: "en" | "es" = "en"
): CoachingDecision {
  const isEs = language === "es";
  const all = [...history, latest].slice(-8);
  const summary = buildCoachingSummary(plan, all);
  const adherence = latest.totalExerciseCount > 0
    ? latest.completedExerciseIds.length / latest.totalExerciseCount
    : 0;

  if (latest.planComplete) {
    return {
      source: "ai",
      reason: isEs ? "El bloque de entrenamiento está completo, así que Coach debe revisar el resultado y crear el siguiente bloque de progresión." : "The training block is complete, so Coach should review the outcome and build the next progression block.",
      requiresUserConfirmation: true,
      changes: [],
      plan,
    };
  }

  if (latest.pain >= 2 || latest.painArea?.trim()) {
    return {
      source: "ai",
      reason: isEs ? "El dolor requiere una selección individualizada de ejercicios y criterio de seguridad." : "Pain requires individualized exercise selection and safety judgment.",
      requiresUserConfirmation: true,
      changes: [],
      plan,
    };
  }

  if (summary.activeConcerns.length > 0 || latest.notes?.trim()) {
    return {
      source: "ai",
      reason: summary.activeConcerns[0] || (isEs ? "La persona proporcionó información que requiere interpretación." : "The athlete supplied context that needs interpretation."),
      requiresUserConfirmation: true,
      changes: [],
      plan,
    };
  }

  if (adherence < 0.65) {
    return {
      source: "rules",
      reason: isEs ? "La sesión se completó parcialmente, así que el plan se mantiene estable." : "The session was partially completed, so the plan is held steady.",
      requiresUserConfirmation: false,
      changes: [isEs ? "Se mantuvo el próximo entrenamiento sin cambios mientras se estabilizan la recuperación y el horario." : "Kept the next workout unchanged while recovery and schedule settle."],
      plan: appendNote(plan, isEs ? "Después de una sesión parcial, repite los objetivos indicados antes de progresar." : "After a partial session, repeat the prescribed targets before progressing."),
    };
  }

  if (latest.difficulty >= 4 || latest.energy <= 2) {
    return {
      source: "rules",
      reason: isEs ? "Un esfuerzo alto o poca energía hacen que progresar sea prematuro." : "High effort or low energy makes progression premature.",
      requiresUserConfirmation: false,
      changes: [isEs ? "Se mantuvieron estables las cargas y el volumen para la próxima sesión equivalente." : "Held loads and volume steady for the next matching session."],
      plan: appendNote(plan, isEs ? "Mantén las cargas actuales después de sesiones de gran esfuerzo o poca energía; prioriza la recuperación." : "Hold current loads after high-effort or low-energy sessions; prioritize recovery."),
    };
  }

  const previousComparable = history
    .filter((entry) => entry.sessionLabel === latest.sessionLabel && entry.pain === 0)
    .slice(-1)[0];
  if (previousComparable && latest.difficulty <= 3 && latest.energy >= 3 && adherence >= 0.95) {
    const increment = plan.units === "kg" ? "2.5 kg" : "5 lb";
    const sessions = plan.sessions.map((session) => {
      if (!isMatchingSession(session, latest)) return session;
      return {
        ...session,
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          progression_rule: isEs ? `La próxima vez, añade 1 repetición por serie o el incremento mínimo disponible (aproximadamente ${increment}); nunca aumentes ambos a la vez.` : `Next time, add 1 rep per set or the smallest available increment (about ${increment}); never increase both at once.`,
        })),
      };
    });
    return {
      source: "rules",
      reason: isEs ? "Dos sesiones exitosas y manejables cumplen el umbral de progresión." : "Two successful, manageable completions satisfy the progression threshold.",
      requiresUserConfirmation: false,
      changes: [isEs ? `Se habilitó una pequeña progresión de repeticiones o carga para ${latest.sessionLabel}.` : `Unlocked a small rep-or-load progression for ${latest.sessionLabel}.`],
      plan: { ...plan, sessions },
    };
  }

  return {
    source: "rules",
    reason: isEs ? "Se registra una sesión exitosa antes de habilitar la progresión." : "One successful session is recorded before progression is earned.",
    requiresUserConfirmation: false,
    changes: [isEs ? "Se registró el entrenamiento y se mantuvo el plan estable hasta otra sesión exitosa." : "Recorded the workout and kept the plan steady until another successful exposure."],
    plan,
  };
}

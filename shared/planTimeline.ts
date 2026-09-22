/* Plan storage normalization. Pure and framework-free so both the client store
   and the regression suite can use it. */

type TimelineExercise = { exercise_id?: string; name: string };
type TimelineSession = { day_label: string; exercises: TimelineExercise[] };
export type TimelinePlan = {
  days_per_week: number;
  timeline_weeks: number;
  goal?: string;
  split?: string;
  sessions: TimelineSession[];
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Detect the language the plan is already written in, so expanded weeks never
 *  mix "Week 2 Day 1" into a Spanish plan. */
export function detectPlanLanguage(plan: TimelinePlan): "en" | "es" {
  const sample = [plan.split ?? "", plan.goal ?? "", ...plan.sessions.map((session) => session.day_label)].join(" ");
  return /(semana|d[ií]a|cuerpo completo)/i.test(sample) ? "es" : "en";
}

export function stripDayPrefix(label: string): string {
  return label
    .replace(/^\s*(?:week|semana)\s*\d+\s*(?:[-–]\s*)?/i, "")
    .replace(/^\s*(?:day|d[ií]a)\s*\d+\s*[-–]\s*/i, "")
    .trim();
}

export function normalizePlanTimeline<P extends TimelinePlan>(plan: P | null): P | null {
  if (!plan) return null;

  const daysPerWeek = Math.max(1, Math.round(plan.days_per_week || 1));
  const weeks = Math.max(1, Math.round(plan.timeline_weeks || 1));
  const expectedSessions = daysPerWeek * weeks;

  if (plan.sessions.length >= expectedSessions || plan.sessions.length === 0) {
    return plan;
  }

  const weeklyTemplate = plan.sessions.slice(0, Math.min(daysPerWeek, plan.sessions.length));
  if (weeklyTemplate.length === 0) return plan;

  const language = detectPlanLanguage(plan);
  const sessions = Array.from({ length: expectedSessions }, (_, index) => {
    const template = weeklyTemplate[index % weeklyTemplate.length];
    const week = Math.floor(index / daysPerWeek) + 1;
    const dayInWeek = (index % daysPerWeek) + 1;
    const baseLabel = stripDayPrefix(template.day_label);

    return {
      ...template,
      day_label:
        language === "es"
          ? `Semana ${week} Día ${dayInWeek} - ${baseLabel}`
          : `Week ${week} Day ${dayInWeek} - ${baseLabel}`,
      exercises: template.exercises.map((exercise) => ({
        ...exercise,
        exercise_id:
          week === 1
            ? exercise.exercise_id
            : `${exercise.exercise_id || slugify(exercise.name)}-w${week}`,
      })),
    };
  });

  return { ...plan, sessions } as P;
}

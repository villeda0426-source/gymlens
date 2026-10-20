// A plan as an ordered sequence — Workout 1, Workout 2, Rest, Workout 3 —
// instead of weekdays, so people train on whatever days suit them. Pure:
// derived from the saved plan plus what's been completed, never stored.
//
// Rest days are placed by rule, so every plan gets them whether it came from
// the template engine, the AI, or an imported routine:
// - never two hard sessions for the same muscles back to back
// - a cap on consecutive training days by experience (beginners recover more)
// - a rest to close out each week of the block when the schedule leaves room
import type { CoachPlan, CoachSession } from "@/lib/coachTrainer";

export type RestTipKey = "lower" | "upper" | "full";

export type PlanSequenceItem =
  | {
      type: "workout";
      key: string;
      sessionIndex: number;
      number: number; // 1-based workout number
      week: number;
      session: CoachSession;
      complete: boolean;
      completedCount: number;
    }
  | {
      type: "rest";
      key: string;
      afterSessionIndex: number;
      week: number;
      tip: RestTipKey;
      complete: boolean;
    };

const MAX_CONSECUTIVE_DAYS: Record<CoachPlan["experience_level"], number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

type MuscleGroup = "legs" | "push" | "pull" | "core";

function muscleGroups(session: CoachSession): Set<MuscleGroup> {
  const groups = new Set<MuscleGroup>();
  // The heavy lifts decide what needs recovering; planks and finishers don't.
  const compounds = session.exercises.filter((exercise) => exercise.category === "compound");
  const lifts = compounds.length > 0 ? compounds : session.exercises.filter((exercise) => exercise.category === "accessory");
  for (const exercise of lifts) {
    // The first two listed are the movement's main movers; later entries
    // are secondary (e.g. a Romanian deadlift's "back") and don't stop the
    // next day from training them.
    for (const raw of exercise.primary_muscles.slice(0, 2)) {
      const muscle = raw.toLowerCase();
      if (/quad|hamstring|glute|leg|calf|calves|cuádricep|cuadricep|isquio|glúteo|gluteo|pierna|pantorrilla/.test(muscle)) groups.add("legs");
      else if (/chest|tricep|shoulder|delt|pec|pecho|tríceps|hombro/.test(muscle)) groups.add("push");
      else if (/back|lat|bicep|trap|rhomboid|espalda|dorsal|bíceps/.test(muscle)) groups.add("pull");
      else if (/core|abs|oblique|abdom|oblicuo/.test(muscle)) groups.add("core");
    }
  }
  return groups;
}

// "Hard" = mostly compound work at a real effort. Light/mobility/cardio-only
// sessions can sit back to back with anything.
function isHardSession(session: CoachSession): boolean {
  const lifts = session.exercises.filter((exercise) => exercise.category === "compound" || exercise.category === "accessory");
  if (lifts.length === 0) return false;
  const compounds = lifts.filter((exercise) => exercise.category === "compound").length;
  const rpes = lifts.map((exercise) => exercise.target_rpe).filter((rpe): rpe is number => typeof rpe === "number");
  const avgRpe = rpes.length ? rpes.reduce((sum, rpe) => sum + rpe, 0) / rpes.length : 7.5;
  return compounds >= 2 && avgRpe >= 6.5;
}

function sharesHardMuscles(a: CoachSession, b: CoachSession): boolean {
  if (!isHardSession(a) || !isHardSession(b)) return false;
  const aGroups = muscleGroups(a);
  for (const group of muscleGroups(b)) {
    if (group !== "core" && aGroups.has(group)) return true;
  }
  return false;
}

function restTipFor(session: CoachSession): RestTipKey {
  const groups = muscleGroups(session);
  const legs = groups.has("legs");
  const upper = groups.has("push") || groups.has("pull");
  if (legs && !upper) return "lower";
  if (upper && !legs) return "upper";
  return "full";
}

export function isSessionComplete(session: CoachSession, completedIds: string[]): boolean {
  return session.exercises.length > 0 && session.exercises.every((exercise) => completedIds.includes(exercise.exercise_id));
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Which sessions get a rest day right after them.
export function restAfterIndexes(plan: CoachPlan): Set<number> {
  const rests = new Set<number>();
  const sessions = plan.sessions;
  const daysPerWeek = Math.max(1, Math.round(plan.days_per_week || 1));
  const maxStreak = MAX_CONSECUTIVE_DAYS[plan.experience_level] ?? 2;
  // A week has 7 days: whatever training doesn't use is room for rest.
  const restBudgetPerWeek = Math.max(0, 7 - daysPerWeek);
  let streak = 0;
  let restsThisWeek = 0;

  sessions.forEach((session, index) => {
    const indexInWeek = index % daysPerWeek;
    if (indexInWeek === 0) restsThisWeek = 0;
    streak += 1;
    const next = sessions[index + 1];
    if (!next) return;

    const endOfWeek = indexInWeek === daysPerWeek - 1;
    const needsRest =
      streak >= maxStreak ||
      sharesHardMuscles(session, next) ||
      // Close out the week with recovery when the schedule leaves room.
      (endOfWeek && restBudgetPerWeek > 0);

    if (needsRest && restsThisWeek < restBudgetPerWeek) {
      rests.add(index);
      restsThisWeek += 1;
      streak = 0;
    }
  });

  return rests;
}

export function buildPlanSequence(args: {
  plan: CoachPlan;
  completedExerciseIds: string[];
  sessionCompletedAt: string[];
  now?: Date;
}): PlanSequenceItem[] {
  const { plan, completedExerciseIds, sessionCompletedAt, now = new Date() } = args;
  const daysPerWeek = Math.max(1, Math.round(plan.days_per_week || 1));
  const rests = restAfterIndexes(plan);

  const lastCompletion = sessionCompletedAt
    .map((iso) => new Date(iso))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const trainedToday = !!lastCompletion && isSameLocalDay(lastCompletion, now);

  const items: PlanSequenceItem[] = [];
  plan.sessions.forEach((session, index) => {
    const completedCount = session.exercises.filter((exercise) => completedExerciseIds.includes(exercise.exercise_id)).length;
    const complete = isSessionComplete(session, completedExerciseIds);
    const week = Math.floor(index / daysPerWeek) + 1;
    items.push({
      type: "workout",
      key: `workout-${index}`,
      sessionIndex: index,
      number: index + 1,
      week,
      session,
      complete,
      completedCount,
    });

    if (rests.has(index)) {
      const next = plan.sessions[index + 1];
      const nextStarted = !!next && next.exercises.some((exercise) => completedExerciseIds.includes(exercise.exercise_id));
      // A rest is done once a day has passed since the workout before it
      // (or the person already moved on to the next workout).
      items.push({
        type: "rest",
        key: `rest-${index}`,
        afterSessionIndex: index,
        week,
        tip: restTipFor(session),
        complete: isRestComplete(complete, trainedToday, nextStarted),
      });
    }
  });

  // Only the rest right after the most recent finished workout can still be
  // pending; any earlier one has obviously been taken.
  let seenPending = false;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    const before = items[i - 1];
    const pending = item.type === "rest" && !item.complete && before?.type === "workout" && before.complete;
    if (!pending) continue;
    if (seenPending) item.complete = true;
    seenPending = true;
  }

  return items;
}

function isRestComplete(workoutBeforeComplete: boolean, trainedToday: boolean, nextStarted: boolean): boolean {
  if (!workoutBeforeComplete) return false;
  if (nextStarted) return true;
  return !trainedToday;
}

// The first thing in order that still needs doing: a workout, or the rest
// day right after the workout someone just finished.
export function nextSequenceItem(items: PlanSequenceItem[]): PlanSequenceItem | null {
  return items.find((item) => !item.complete) ?? null;
}

// The next workout to train, skipping over a pending rest day.
export function nextWorkoutItem(items: PlanSequenceItem[]): Extract<PlanSequenceItem, { type: "workout" }> | null {
  const next = items.find((item) => item.type === "workout" && !item.complete);
  return next && next.type === "workout" ? next : null;
}

const WEEKDAY_PATTERN =
  /\b(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi;

// The session's name without schedule scaffolding ("Week 1 Day 2 -",
// weekday names) — the workout number carries the order instead.
export function sessionDisplayName(session: CoachSession): string {
  const stripped = session.day_label
    .replace(/^(?:(?:Week\s*\d+\s+)?Day\s*\d+\s*[-–:]\s*)+/i, "")
    .replace(/^(?:(?:Semana\s*\d+\s+)?D[ií]a\s*\d+\s*[-–:]\s*)+/i, "")
    .replace(WEEKDAY_PATTERN, "")
    .replace(/^[\s\-–:·,]+|[\s\-–:·,]+$/g, "")
    .trim();
  return stripped || session.focus;
}

export type IntensityLevel = "light" | "moderate" | "high";

export function sessionIntensity(session: CoachSession): IntensityLevel {
  const lifts = session.exercises.filter((exercise) => exercise.category === "compound" || exercise.category === "accessory");
  const rpes = lifts.map((exercise) => exercise.target_rpe).filter((rpe): rpe is number => typeof rpe === "number");
  const avgRpe = rpes.length ? rpes.reduce((sum, rpe) => sum + rpe, 0) / rpes.length : 7;
  const avgMinReps = lifts.length ? lifts.reduce((sum, exercise) => sum + exercise.rep_range.min, 0) / lifts.length : 10;
  const score = avgRpe + (avgMinReps <= 6 ? 0.75 : 0);
  if (score >= 8) return "high";
  if (score >= 6.75) return "moderate";
  return "light";
}

export function planIntensity(plan: CoachPlan): IntensityLevel {
  const levels = plan.sessions.slice(0, Math.max(1, plan.days_per_week)).map(sessionIntensity);
  if (levels.includes("high")) return "high";
  if (levels.includes("moderate")) return "moderate";
  return "light";
}

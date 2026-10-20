// Coach Forward weekly check-in — Phase 4.
//
// TODO: backend. There is no weekly-check-in data model today: CoachPlan
// only carries `weekly_notes` as free text (server/services/coachTrainerService.ts),
// and completedExerciseIds (store/coachTrainerStore.ts) has no per-day/per-week
// timestamps to derive real adherence, a day-by-day chart, or a change log
// from. This module returns realistic mock data shaped like what a real
// endpoint would return, so app/coach-week.tsx has something coherent to
// render. Swap getCoachWeekSummary's body for a real fetch (and
// approveCoachWeekChanges for a real mutation) once that backend exists —
// nothing else on the screen should need to change.
import { CoachPlan } from "@/lib/coachTrainer";

export type CoachWeekDayStatus = "done" | "rest";

export type CoachWeekDay = {
  label: string;
  status: CoachWeekDayStatus;
  // 0-1: relative bar height for the mini chart (a stand-in for session
  // duration/volume once real per-day logs exist).
  intensity: number;
};

export type CoachWeekObservationTone = "positive" | "attention";

export type CoachWeekObservation = {
  id: string;
  tone: CoachWeekObservationTone;
  text: string;
};

export type CoachWeekChange = {
  id: string;
  text: string;
};

export type CoachWeekSummary = {
  weekNumber: number;
  workoutsCompleted: number;
  workoutsPlanned: number;
  headline: string;
  days: CoachWeekDay[];
  observations: CoachWeekObservation[];
  changes: CoachWeekChange[];
};

// TODO: backend. Mock content, mirroring the Coach Forward mockup
// (CoachWeek.html) until a real weekly-check-in endpoint exists.
export async function getCoachWeekSummary(
  plan: CoachPlan | null,
  t: (key: string, options?: Record<string, unknown>) => string
): Promise<CoachWeekSummary> {
  const workoutsPlanned = plan?.days_per_week ?? 4;
  const workoutsCompleted = Math.min(workoutsPlanned, 3);

  return {
    weekNumber: 3,
    workoutsCompleted,
    workoutsPlanned,
    headline: t("coach_week.mock.headline"),
    // One bar per workout in order (no weekdays — workouts aren't tied to them).
    days: Array.from({ length: Math.max(workoutsPlanned, 1) }, (_, index) => ({
      label: t("plan.workout_short", { number: index + 1 }),
      status: index < workoutsCompleted ? ("done" as const) : ("rest" as const),
      intensity: [0.7, 0.9, 1, 0.8, 0.6, 0.75][index % 6],
    })),
    observations: [
      { id: "leg-press-progress", tone: "positive", text: t("coach_week.mock.leg_press_progress") },
      { id: "last-workout-skipped", tone: "attention", text: t("coach_week.mock.last_workout_skipped") },
    ],
    changes: [
      { id: "shorter-last-workout", text: t("coach_week.mock.shorter_last_workout") },
      { id: "add-leg-press-load", text: t("coach_week.mock.add_leg_press_load") },
      { id: "keep-cable-fly", text: t("coach_week.mock.keep_cable_fly") },
    ],
  };
}

// TODO: backend. Local-only acknowledgement: there is nothing to persist or
// apply to the saved plan yet (unlike Phase 3's plan_updated suggestions,
// which do edit a real CoachPlan). Wire this to a real mutation once the
// weekly check-in has one.
export function approveCoachWeekChanges(_summary: CoachWeekSummary): void {}

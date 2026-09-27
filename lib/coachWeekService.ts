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
export async function getCoachWeekSummary(plan: CoachPlan | null): Promise<CoachWeekSummary> {
  const workoutsPlanned = plan?.days_per_week ?? 4;
  const workoutsCompleted = Math.min(workoutsPlanned, 3);

  return {
    weekNumber: 3,
    workoutsCompleted,
    workoutsPlanned,
    headline: "workouts done. Nice week.",
    days: [
      { label: "M", status: "done", intensity: 0.7 },
      { label: "T", status: "rest", intensity: 0.1 },
      { label: "W", status: "done", intensity: 0.9 },
      { label: "T", status: "rest", intensity: 0.1 },
      { label: "F", status: "rest", intensity: 0.1 },
      { label: "S", status: "done", intensity: 1 },
      { label: "S", status: "rest", intensity: 0.1 },
    ],
    observations: [
      { id: "leg-press-progress", tone: "positive", text: "Leg press is up 10 kg since week 1." },
      { id: "friday-skipped", tone: "attention", text: "Friday sessions keep getting skipped." },
    ],
    changes: [
      { id: "move-friday", text: "Move Friday's workout to Saturday morning." },
      { id: "add-leg-press-load", text: "Add 2.5 kg to leg press." },
      { id: "keep-cable-fly", text: "Keep cable fly instead of chest press." },
    ],
  };
}

// TODO: backend. Local-only acknowledgement: there is nothing to persist or
// apply to the saved plan yet (unlike Phase 3's plan_updated suggestions,
// which do edit a real CoachPlan). Wire this to a real mutation once the
// weekly check-in has one.
export function approveCoachWeekChanges(_summary: CoachWeekSummary): void {}

// Context-aware suggestion chips for the Coach chat. Pure — derives the
// person's plan state from what the Coach store already knows and picks the
// chips that make sense for it, so e.g. someone with an active plan never
// sees "Create my 21-day plan".
import type { CoachPlan } from "@/lib/coachTrainer";
import type { Feeling } from "@/components/Coach/FeelingCheckIn";
import { buildPlanSequence, nextSequenceItem } from "@/lib/planSequence";

export type CoachPlanState = "no_plan" | "workout_today" | "rest_or_done" | "plan_finished";

// What tapping a chip does. "flow" starts the step-by-step question cards;
// "message" sends the chip's label to Coach; "navigate" opens a screen.
export type CoachChipAction =
  | { type: "flow"; sessionMinutes?: 30 }
  | { type: "message" }
  | { type: "navigate"; pathname: "/workout-session" | "/coach-week" };

export interface CoachChip {
  key: string; // i18n key under trainer.quick_actions
  action: CoachChipAction;
}

export function getCoachPlanState(args: {
  plan: CoachPlan | null;
  completedExerciseIds: string[];
  sessionCompletedAt: string[];
  now?: Date;
}): CoachPlanState {
  const { plan, completedExerciseIds, sessionCompletedAt, now = new Date() } = args;
  if (!plan || plan.sessions.length === 0) return "no_plan";

  // Plans are an ordered sequence (Workout 1, Workout 2, Rest, ...), not
  // calendar days: "rest" means the next thing in order is a rest day.
  const sequence = buildPlanSequence({ plan, completedExerciseIds, sessionCompletedAt, now });
  const next = nextSequenceItem(sequence);
  if (!next) return "plan_finished";
  if (next.type === "rest") return "rest_or_done";
  return "workout_today";
}

const k = (name: string) => `trainer.quick_actions.${name}`;

export function getCoachChips(state: CoachPlanState, feeling: Feeling | null): CoachChip[] {
  if (state === "no_plan") {
    return [
      { key: k("create_plan"), action: { type: "flow" } },
      { key: k("what_can_you_do"), action: { type: "message" } },
      { key: k("thirty_minutes"), action: { type: "flow", sessionMinutes: 30 } },
    ];
  }

  if (state === "plan_finished") {
    return [
      { key: k("build_next_block"), action: { type: "flow" } },
      { key: k("review_progress"), action: { type: "message" } },
    ];
  }

  // "A bit sore" from the check-in card steers toward recovery either way.
  if (feeling === "sore") {
    return state === "workout_today"
      ? [
          { key: k("lighter_today"), action: { type: "message" } },
          { key: k("recovery_ideas"), action: { type: "message" } },
          { key: k("swap_exercise"), action: { type: "message" } },
          { key: k("start_today"), action: { type: "navigate", pathname: "/workout-session" } },
        ]
      : [
          { key: k("recovery_ideas"), action: { type: "message" } },
          { key: k("review_week"), action: { type: "navigate", pathname: "/coach-week" } },
          { key: k("whats_next"), action: { type: "message" } },
        ];
  }

  if (state === "workout_today") {
    return [
      { key: k("start_today"), action: { type: "navigate", pathname: "/workout-session" } },
      { key: k("swap_exercise"), action: { type: "message" } },
      { key: k("thirty_minutes"), action: { type: "message" } },
      { key: k("sore_today"), action: { type: "message" } },
    ];
  }

  return [
    { key: k("review_week"), action: { type: "navigate", pathname: "/coach-week" } },
    { key: k("recovery_ideas"), action: { type: "message" } },
    { key: k("whats_next"), action: { type: "message" } },
  ];
}

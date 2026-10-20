// Coach always offers two distinct plans to choose from — never one — and
// nothing is saved until the person picks. Options come from the template
// engine when the answers are plain taps, otherwise from two Coach jobs run
// in parallel, each told which direction to take so they don't converge.
import {
  runCoachTrainerJob,
  type CoachLanguage,
  type CoachMessage,
  type CoachPlan,
  type CoachResponse,
  type Units,
} from "@/lib/coachTrainer";
import { planIntensity, type IntensityLevel } from "@/lib/planSequence";
import { buildTemplatePlan, type BuildTemplatePlanInput } from "@/shared/buildTemplatePlan";

export type PlanOptionId = "A" | "B";

export type PlanOption = {
  id: PlanOptionId;
  plan: CoachPlan;
  summary: string;
};

export type PlanOptionStats = {
  focus: string;
  split: string;
  workoutsPerWeek: number;
  exercisesPerWorkout: number;
  minutes: number;
  intensity: IntensityLevel;
};

export function planOptionStats(plan: CoachPlan): PlanOptionStats {
  const week = plan.sessions.slice(0, Math.max(1, Math.round(plan.days_per_week || 1)));
  const count = Math.max(1, week.length);
  const focuses = [...new Set(week.map((session) => session.focus.trim()).filter(Boolean))];
  return {
    focus: focuses.slice(0, 2).join(" · ") || plan.split,
    split: plan.split,
    workoutsPerWeek: Math.max(1, Math.round(plan.days_per_week || week.length)),
    exercisesPerWorkout: Math.round(week.reduce((sum, session) => sum + session.exercises.length, 0) / count),
    minutes: Math.round(week.reduce((sum, session) => sum + session.estimated_minutes, 0) / count),
    intensity: planIntensity(plan),
  };
}

export function buildTemplatePlanOptions(input: Omit<BuildTemplatePlanInput, "style">): PlanOption[] | null {
  const standard = buildTemplatePlan({ ...input, style: "standard" });
  const alternate = buildTemplatePlan({ ...input, style: "alternate" });
  if (!standard || !alternate) return null;
  return [
    { id: "A", plan: standard, summary: standard.weekly_notes },
    { id: "B", plan: alternate, summary: alternate.weekly_notes },
  ];
}

// Written to the model, not shown to the person, so English either way —
// the CONTEXT language still decides the language of the plan itself.
const VARIANT_DIRECTIONS: Record<PlanOptionId, string> = {
  A: "OPTION A of two the person will choose between: build the most standard, balanced plan for these answers — the split a top coach would pick first, moderate intensity, classic straight sets.",
  B: "OPTION B of two the person will choose between: it must be clearly different from the standard choice — use a DIFFERENT split type than the most standard one for these answers (e.g. upper/lower or push/pull/legs instead of full body, or full body instead of a split), different main exercises where sensible, and a heavier, lower-rep emphasis or a denser superset/circuit format. Same goal, same safety limits, same number of training days.",
};

export function withVariantDirection(message: string, id: PlanOptionId): string {
  return `${message}\n\n${VARIANT_DIRECTIONS[id]}`;
}

export function instructionsDirective(instructions: string): string {
  return `CUSTOM INSTRUCTIONS (these override any earlier answer that conflicts, for this plan): ${instructions.trim()}`;
}

export type PlanOptionsResult =
  | { kind: "options"; options: PlanOption[] }
  // Coach answered with a question/message instead of a plan.
  | { kind: "message"; response: CoachResponse };

// Two intake jobs in parallel. A failed variant is retried once; if it
// still fails, the other one is offered alone rather than nothing at all.
export async function generateAiPlanOptions(args: {
  units: Units;
  language: CoachLanguage;
  history: CoachMessage[];
  userMessage: string;
  authToken: string;
  signal?: AbortSignal;
}): Promise<PlanOptionsResult> {
  const { units, language, history, userMessage, authToken, signal } = args;
  const run = (id: PlanOptionId) =>
    runCoachTrainerJob(
      { mode: "intake", units, language, history, userMessage: withVariantDirection(userMessage, id) },
      { authToken, signal }
    );
  const runWithRetry = async (id: PlanOptionId): Promise<CoachResponse | null> => {
    try {
      return await run(id);
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
      try {
        return await run(id);
      } catch (retryError: any) {
        if (retryError?.name === "AbortError") throw retryError;
        return null;
      }
    }
  };

  const [a, b] = await Promise.all([runWithRetry("A"), runWithRetry("B")]);
  const responses = [a, b];
  const nonPlan = responses.find((response) => response && response.status !== "plan_ready" && response.status !== "plan_updated");
  const options: PlanOption[] = [];
  (["A", "B"] as const).forEach((id, index) => {
    const response = responses[index];
    if (response && (response.status === "plan_ready" || response.status === "plan_updated")) {
      options.push({ id, plan: response.plan, summary: response.summary });
    }
  });

  // A server-side fallback can hand both variants the same canned plan;
  // two identical cards aren't a choice, so offer just one.
  if (options.length === 2 && JSON.stringify(options[0].plan.sessions) === JSON.stringify(options[1].plan.sessions)) {
    options.pop();
  }

  if (options.length === 0) {
    if (nonPlan) return { kind: "message", response: nonPlan };
    throw new Error("Coach could not build plan options.");
  }
  return { kind: "options", options: options.map((option, index) => ({ ...option, id: index === 0 ? "A" : "B" })) };
}

// "Adjust this" on one option card: rework just that option.
export async function adjustPlanOption(args: {
  option: PlanOption;
  instructions: string;
  units: Units;
  language: CoachLanguage;
  authToken: string;
  signal?: AbortSignal;
}): Promise<PlanOption> {
  const { option, instructions, units, language, authToken, signal } = args;
  const response = await runCoachTrainerJob(
    {
      mode: "update_goals",
      units,
      language,
      currentPlan: option.plan,
      newGoal: `${instructionsDirective(instructions)} Keep everything else about this option the same.`,
    },
    { authToken, signal }
  );
  if (response.status !== "plan_ready" && response.status !== "plan_updated") {
    throw new Error("message" in response ? response.message : "Coach could not adjust this option.");
  }
  return { id: option.id, plan: response.plan, summary: response.summary };
}

// Two takes on one workout (custom instructions with a plan already
// running): Coach reworks just that session, twice, in different directions.
export async function generateSessionOptions(args: {
  plan: CoachPlan;
  sessionIndex: number;
  instructions: string;
  units: Units;
  language: CoachLanguage;
  authToken: string;
  signal?: AbortSignal;
}): Promise<PlanOption[]> {
  const { plan, sessionIndex, instructions, units, language, authToken, signal } = args;
  const session = plan.sessions[sessionIndex];
  if (!session) throw new Error("No workout to adjust.");
  const singleSessionPlan: CoachPlan = { ...plan, days_per_week: 1, timeline_weeks: 1, sessions: [session] };
  const directions: Record<PlanOptionId, string> = {
    A: "Rewrite this ONE workout (keep exactly one session) following the instructions, staying as close as possible to its original structure.",
    B: "Rewrite this ONE workout (keep exactly one session) following the instructions, but take a clearly different approach from the original — different main exercises and a different format (e.g. circuit or supersets) or intensity.",
  };
  const run = async (id: PlanOptionId): Promise<PlanOption | null> => {
    try {
      const response = await runCoachTrainerJob(
        {
          mode: "update_goals",
          units,
          language,
          currentPlan: singleSessionPlan,
          newGoal: `${instructionsDirective(instructions)} ${directions[id]}`,
        },
        { authToken, signal }
      );
      if ((response.status === "plan_ready" || response.status === "plan_updated") && response.plan.sessions[0]) {
        return { id, plan: { ...response.plan, days_per_week: 1, sessions: [response.plan.sessions[0]] }, summary: response.summary };
      }
      return null;
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
      return null;
    }
  };
  const results = (await Promise.all([run("A"), run("B")])).filter((option): option is PlanOption => !!option);
  if (results.length === 0) throw new Error("Coach could not adjust this workout.");
  return results.map((option, index) => ({ ...option, id: index === 0 ? "A" : "B" }));
}

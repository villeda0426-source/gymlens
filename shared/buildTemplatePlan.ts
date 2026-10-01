// Deterministic plan builder — QA #9. Builds a CoachPlan straight from
// shared/coachProgramming.ts's evidence-based exercise library and day
// templates, with no AI call: the Build My Plan tap-only flow already
// collects goal/days/equipment/experience/limitations as structured fields
// (not prose), so there's nothing here that needs an LLM to parse. The
// chat-based intake path is untouched — this only replaces how the
// tap-only flow (store/planSetupStore.ts) gets its first plan.
import {
  DAYS,
  EXERCISES,
  PRESCRIPTION,
  SLOT_FALLBACK,
  TIER_RANK,
  WEEK_LAYOUT,
  estimateMinutes,
  type Area,
  type DayTemplate,
  type Exercise,
  type Experience as TemplateExperience,
  type Pattern,
  type Slot,
  type Tier,
} from "./coachProgramming";
import type { PlanSetupGoal, PlanSetupLocation, PlanSetupExperience, SessionMinutes } from "@/store/planSetupStore";
import type { CoachExercise, CoachPlan, CoachSession, Units } from "@/lib/coachTrainer";

type TemplateGoal = keyof typeof PRESCRIPTION.goalAdjust;

const GOAL_MAP: Record<PlanSetupGoal, TemplateGoal> = {
  strength: "strength",
  hypertrophy: "muscle",
  fat_loss: "lose_fat",
  general_fitness: "feel_fitter",
};

const TIER_MAP: Record<PlanSetupLocation, Tier> = {
  full_gym: "gym",
  dumbbells_home: "home_gear",
  bodyweight: "bodyweight",
};

const EXPERIENCE_MAP: Record<PlanSetupExperience, TemplateExperience> = {
  beginner: "brand_new",
  intermediate: "some",
  advanced: "consistent",
};

const SPLIT_NAMES: Record<string, string> = {
  FULL_A: "Full Body",
  FULL_B: "Full Body",
  UPPER_A: "Upper/Lower",
  UPPER_B: "Upper/Lower",
  LOWER_A: "Upper/Lower",
  LOWER_B: "Upper/Lower",
};

// Best-effort extraction from the free-text "which area" follow-up (step 5).
// Never blocks plan generation if nothing matches — an unmatched area just
// means no exercise gets excluded, same as not mentioning one at all.
const AREA_KEYWORDS: Array<[RegExp, Area]> = [
  [/shoulder|hombro/i, "shoulder"],
  [/elbow|codo/i, "elbow"],
  [/wrist|muñeca/i, "wrist"],
  [/low(er)?\s*back|lumbar|espalda/i, "lower_back"],
  [/\bhip\b|cadera/i, "hip"],
  [/knee|rodilla/i, "knee"],
  [/ankle|tobillo/i, "ankle"],
  [/neck|cuello/i, "neck"],
];

export function extractAreasFromText(text: string): Area[] {
  const found = new Set<Area>();
  for (const [pattern, area] of AREA_KEYWORDS) {
    if (pattern.test(text)) found.add(area);
  }
  return [...found];
}

export interface BuildTemplatePlanInput {
  goal: PlanSetupGoal;
  daysPerWeek: number;
  sessionMinutes: SessionMinutes;
  location: PlanSetupLocation;
  experience: PlanSetupExperience;
  avoidAreas: Area[];
  lightModerate: boolean; // heart condition / other condition / pregnancy, no acute symptoms
  units: Units;
  language: "en" | "es";
}

function repsLeftToRpe(effort: string): number {
  const numbers = effort.match(/\d+/g)?.map(Number) ?? [3];
  const avg = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  return Math.max(5, Math.min(9, Math.round((10 - avg) * 10) / 10));
}

function loadHintForExercise(exercise: Exercise): string {
  const inc = PRESCRIPTION.progression.increments;
  if (exercise.minTier === "bodyweight") return inc.bodyweight;
  if (/^band_/.test(exercise.id)) return inc.band;
  if (/^(db_|dumbbell)/.test(exercise.id) || exercise.id.includes("db_")) return inc.dumbbell;
  return inc.machine;
}

function pickExercise(
  pattern: Pattern,
  variant: 0 | 1 | undefined,
  tier: Tier,
  level: TemplateExperience,
  avoidAreas: Area[],
  used: Set<string>
): Exercise | null {
  const candidates = EXERCISES.filter(
    (e) =>
      e.pattern === pattern &&
      TIER_RANK[tier] >= TIER_RANK[e.minTier] &&
      (level !== "brand_new" || e.level === "beginner") &&
      !e.avoidFor.some((area) => avoidAreas.includes(area)) &&
      !used.has(e.id)
  );
  if (candidates.length === 0) return null;
  return candidates[Math.min(variant ?? 0, candidates.length - 1)];
}

// Follows SLOT_FALLBACK one hop if the primary pattern has no eligible
// exercise (e.g. bodyweight-only has no vertical pull, or avoidAreas
// eliminated every option). Never invents an exercise — a slot with no
// eligible exercise anywhere in the chain is just skipped.
function pickForSlot(
  slot: Slot,
  tier: Tier,
  level: TemplateExperience,
  avoidAreas: Area[],
  used: Set<string>
): Exercise | null {
  const direct = pickExercise(slot.pattern, slot.variant, tier, level, avoidAreas, used);
  if (direct) return direct;
  const fallback = SLOT_FALLBACK[slot.pattern];
  if (!fallback) return null;
  return pickExercise(fallback.pattern, fallback.variant, tier, level, avoidAreas, used);
}

function buildExercise(
  exercise: Exercise,
  slot: Slot,
  templateGoal: TemplateGoal,
  templateExperience: TemplateExperience,
  lightModerate: boolean
): CoachExercise {
  const week1 = PRESCRIPTION.weeks[templateExperience][0];
  const goalAdjust = PRESCRIPTION.goalAdjust[templateGoal];

  let repRange: readonly [number, number] =
    slot.role === "main"
      ? ("mainReps" in goalAdjust ? goalAdjust.mainReps : PRESCRIPTION.repRange.main)
      : ("accessoryReps" in goalAdjust ? goalAdjust.accessoryReps : PRESCRIPTION.repRange.accessory);
  if (exercise.timed) repRange = PRESCRIPTION.timedSeconds;

  const restSeconds =
    slot.role === "main" && "mainRestSeconds" in goalAdjust
      ? goalAdjust.mainRestSeconds
      : PRESCRIPTION.restSeconds[slot.role];

  // Light-to-moderate (QA #5 safety path, not a separate gate here — just a
  // lower target effort): one step easier than the week-1 default.
  const targetRpe = Math.max(5, repsLeftToRpe(week1.effort) - (lightModerate ? 1 : 0));

  const sameePatternNames = EXERCISES.filter((e) => e.pattern === exercise.pattern && e.id !== exercise.id)
    .slice(0, 2)
    .map((e) => e.en);

  return {
    exercise_id: exercise.id,
    name: exercise.en,
    category: slot.role === "main" ? "compound" : "accessory",
    primary_muscles: [...exercise.primary, ...exercise.secondary],
    sets: week1.sets,
    rep_range: { min: repRange[0], max: repRange[1] },
    target_rpe: targetRpe,
    target_load: PRESCRIPTION.progression.firstSession,
    rest_seconds: restSeconds,
    tempo: null,
    progression_rule: `${PRESCRIPTION.progression.rule} (${loadHintForExercise(exercise)}). ${PRESCRIPTION.progression.onMiss}`,
    substitutions: sameePatternNames,
    coach_notes: exercise.cue,
  };
}

function buildSession(day: DayTemplate, input: BuildTemplatePlanInput, templateGoal: TemplateGoal, templateExperience: TemplateExperience): CoachSession {
  const { location, sessionMinutes, avoidAreas, lightModerate } = input;
  const tier = TIER_MAP[location];
  const used = new Set<string>();
  const picked: Array<{ exercise: Exercise; slot: Slot }> = [];

  for (const slot of day.slots) {
    const exercise = pickForSlot(slot, tier, templateExperience, avoidAreas, used);
    if (!exercise) continue; // no eligible exercise anywhere in the fallback chain
    used.add(exercise.id);
    picked.push({ exercise, slot });

    // Add slots in priority order until the time budget is used, minimum 4.
    const minutesSoFar = estimateMinutes(
      picked.map((p) => ({ sets: PRESCRIPTION.weeks[templateExperience][0].sets, role: p.slot.role }))
    );
    if (picked.length >= 4 && minutesSoFar >= sessionMinutes) break;
  }

  const exercises = picked.map((p) => buildExercise(p.exercise, p.slot, templateGoal, templateExperience, lightModerate));
  const estimatedMinutes = estimateMinutes(
    picked.map((p) => ({ sets: PRESCRIPTION.weeks[templateExperience][0].sets, role: p.slot.role }))
  );

  return {
    day_label: day.name,
    focus: day.name,
    estimated_minutes: estimatedMinutes,
    exercises,
  };
}

// Returns null only if literally no session could be built (e.g. an
// unrecognized days_per_week) — the caller should fall back to the AI path
// in that case rather than show a broken plan.
export function buildTemplatePlan(input: BuildTemplatePlanInput): CoachPlan | null {
  const templateGoal = GOAL_MAP[input.goal];
  const templateExperience = EXPERIENCE_MAP[input.experience];
  const dayIds = WEEK_LAYOUT[templateExperience]?.[input.daysPerWeek];
  if (!dayIds || dayIds.length === 0) return null;

  // Matches the existing contract (AI-generated plans do the same): sessions
  // holds only the first training week's unique templates, capped at 4.
  // store/coachTrainerStore.ts's normalizePlanTimeline() cycles these across
  // the full days_per_week and expands to the multi-week block.
  const uniqueDayIds = [...new Set(dayIds)].slice(0, 4);
  const sessions = uniqueDayIds
    .map((id) => DAYS[id])
    .filter((day): day is DayTemplate => !!day)
    .map((day) => buildSession(day, input, templateGoal, templateExperience))
    // A heavily restricted combination (e.g. bodyweight-only + avoiding
    // shoulders) can leave a day with no eligible exercise anywhere in its
    // fallback chain for any slot. Never invent one (per the source data's
    // own rule) — drop the day entirely rather than show a blank session.
    .filter((session) => session.exercises.length > 0);
  if (sessions.length === 0) return null;

  const splitName = SPLIT_NAMES[uniqueDayIds[0]] ?? "Full Body";
  const weeklyTargets = PRESCRIPTION.weeklySetTargets[templateExperience];
  const goalAdjust = PRESCRIPTION.goalAdjust[templateGoal];
  const optionalFinisher = "optionalFinisher" in goalAdjust ? ` ${goalAdjust.optionalFinisher}.` : "";

  return {
    goal: input.goal,
    goal_type:
      input.goal === "hypertrophy" ? "hypertrophy" : input.goal === "fat_loss" ? "fat_loss" : input.goal === "strength" ? "strength" : "general_fitness",
    experience_level: input.experience,
    units: input.units,
    timeline_weeks: 3,
    days_per_week: input.daysPerWeek,
    split: splitName,
    equipment: [input.location],
    constraints: input.avoidAreas,
    progression_strategy: PRESCRIPTION.progression.rule,
    sessions,
    weekly_notes:
      `${PRESCRIPTION.weeks[templateExperience][0].note} Aim for roughly ${weeklyTargets[0]}-${weeklyTargets[1]} hard sets per muscle group across the week.${optionalFinisher}` +
      (input.lightModerate ? " Built at a lighter, more conservative intensity — check with a doctor before pushing to high intensity." : ""),
    safety_flags: input.lightModerate ? ["check with a doctor before pushing to high intensity"] : [],
  };
}

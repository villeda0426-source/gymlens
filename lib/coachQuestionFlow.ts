// Step-by-step plan questions asked inside the Coach chat — one card per
// question (components/Coach/CoachQuestionCard.tsx, built from the Build My
// Plan wizard's components) instead of one Coach bubble listing every
// question at once. This file is the pure part: the question set, answer
// labels, and turning finished answers into a plan or an intake message.
import type { CoachPlan, Units } from "@/lib/coachTrainer";
import type { PlanSetupExperience, PlanSetupGoal, PlanSetupLocation, SessionMinutes } from "@/store/planSetupStore";
import { buildTemplatePlan } from "@/shared/buildTemplatePlan";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type QuestionId = "goal" | "days" | "equipment" | "experience" | "limitations";
export type QuestionLayout = "cards" | "chips";

export interface QuestionOption {
  value: string;
  // OptionCard layout only.
  icon?: string;
  iconBg?: string;
  iconColor?: string;
  // Picking this option asks for a short free-text detail ("Other", "Yes").
  freeText?: boolean;
  // Multi-select: picking this clears every other option, and vice versa.
  exclusive?: boolean;
}

export interface QuestionDef {
  id: QuestionId;
  layout: QuestionLayout;
  multi: boolean;
  options: QuestionOption[];
}

// values: picked option values. text: free-text detail, or — when values is
// empty — an answer typed into the composer instead of tapping an option.
export interface QuestionAnswer {
  values: string[];
  text?: string;
}

export type QuestionFlowAnswers = Partial<Record<QuestionId, QuestionAnswer>>;

export const QUESTIONS: QuestionDef[] = [
  {
    id: "goal",
    layout: "cards",
    multi: false,
    options: [
      { value: "strength", icon: "barbell", iconBg: "#fdecec", iconColor: "#c53838" },
      { value: "hypertrophy", icon: "body", iconBg: "#eef1f6", iconColor: "#0c2340" },
      { value: "fat_loss", icon: "water", iconBg: "#fff3e0", iconColor: "#8a5a00" },
      { value: "general_fitness", icon: "pulse", iconBg: "#eef6e0", iconColor: "#4f8000" },
      { value: "other", icon: "create-outline", iconBg: "#eef1f6", iconColor: "#0c2340", freeText: true },
    ],
  },
  {
    id: "days",
    layout: "chips",
    multi: false,
    options: [{ value: "1" }, { value: "2" }, { value: "3" }, { value: "4" }],
  },
  {
    id: "equipment",
    layout: "chips",
    multi: true,
    options: [
      { value: "full_gym" },
      { value: "barbell" },
      { value: "dumbbells" },
      { value: "kettlebells" },
      { value: "bands" },
      { value: "bodyweight", exclusive: true },
    ],
  },
  {
    id: "experience",
    layout: "cards",
    multi: false,
    options: [
      { value: "beginner", icon: "bar-chart", iconBg: "transparent", iconColor: "#c53838" },
      { value: "intermediate", icon: "bar-chart", iconBg: "transparent", iconColor: "#c53838" },
      { value: "advanced", icon: "bar-chart", iconBg: "transparent", iconColor: "#c53838" },
    ],
  },
  {
    id: "limitations",
    layout: "cards",
    multi: false,
    options: [
      { value: "none", icon: "checkmark-circle", iconBg: "#eef6e0", iconColor: "#4f8000" },
      { value: "yes", icon: "bandage", iconBg: "#fdecec", iconColor: "#c53838", freeText: true },
    ],
  },
];

export function getQuestion(id: QuestionId): QuestionDef {
  return QUESTIONS.find((question) => question.id === id)!;
}

// Questions still unanswered, in order — so a path that already knows an
// answer (passed in as `known`) skips straight past it.
export function remainingQuestions(answers: QuestionFlowAnswers): QuestionId[] {
  return QUESTIONS.map((question) => question.id).filter((id) => !answers[id]);
}

export function isAnswerComplete(question: QuestionDef, answer: QuestionAnswer): boolean {
  if (answer.values.length === 0) return !!answer.text?.trim();
  const needsText = answer.values.some((value) => question.options.find((option) => option.value === value)?.freeText);
  return !needsText || !!answer.text?.trim();
}

export function optionLabel(t: Translate, id: QuestionId, value: string): string {
  return t(`trainer.question_flow.${id}.options.${value}`);
}

// The user's side of the chat once a card is answered, e.g. "Dumbbells only,
// Kettlebells" or "Yes — left knee, ACL repair last year".
export function answerLabel(t: Translate, id: QuestionId, answer: QuestionAnswer): string {
  const text = answer.text?.trim();
  if (answer.values.length === 0) return text ?? "";
  if (id === "goal" && answer.values[0] === "other" && text) return text;
  // Experience levels are only meaningful with their range attached.
  const labels = answer.values
    .map((value) =>
      id === "experience"
        ? `${optionLabel(t, id, value)} (${t(`trainer.question_flow.experience.descriptions.${value}`)})`
        : optionLabel(t, id, value)
    )
    .join(", ");
  return text ? `${labels} — ${text}` : labels;
}

function equipmentToLocation(values: string[]): PlanSetupLocation | null {
  if (values.includes("full_gym")) return "full_gym";
  if (values.length === 1 && values[0] === "bodyweight") return "bodyweight";
  if (values.length === 1 && values[0] === "dumbbells") return "dumbbells_home";
  return null;
}

const TEMPLATE_GOALS: PlanSetupGoal[] = ["strength", "hypertrophy", "fat_loss", "general_fitness"];
const TEMPLATE_EXPERIENCE: PlanSetupExperience[] = ["beginner", "intermediate", "advanced"];

// Same evidence-based template engine the Build My Plan wizard uses (QA #9).
// Only used when every answer is a plain tap the templates cover; anything
// typed (an "Other" goal, an injury, a free-text answer, an equipment mix
// the templates don't model) goes to Coach instead so it's actually read —
// injuries in particular need the AI path's safety rules.
export function buildFlowTemplatePlan(
  answers: QuestionFlowAnswers,
  args: { sessionMinutes: SessionMinutes; units: Units; language: "en" | "es"; hasNote: boolean }
): CoachPlan | null {
  if (args.hasNote) return null;
  const { goal, days, equipment, experience, limitations } = answers;
  if (!goal || !days || !equipment || !experience || !limitations) return null;
  if ([goal, days, equipment, experience, limitations].some((answer) => answer.text?.trim())) return null;

  const goalValue = goal.values[0] as PlanSetupGoal;
  const experienceValue = experience.values[0] as PlanSetupExperience;
  const location = equipmentToLocation(equipment.values);
  const daysPerWeek = Number(days.values[0]);
  if (!TEMPLATE_GOALS.includes(goalValue) || !TEMPLATE_EXPERIENCE.includes(experienceValue)) return null;
  if (!location || !Number.isFinite(daysPerWeek) || limitations.values[0] !== "none") return null;

  return buildTemplatePlan({
    goal: goalValue,
    daysPerWeek,
    sessionMinutes: args.sessionMinutes,
    location,
    experience: experienceValue,
    avoidAreas: [],
    lightModerate: false,
    units: args.units,
    language: args.language,
  });
}

// One message carrying every answer, for Coach's intake mode — which goes
// straight to plan_ready when the first message already has everything.
export function buildFlowIntakeMessage(
  t: Translate,
  answers: QuestionFlowAnswers,
  args: { sessionMinutes: SessionMinutes; note?: string }
): string {
  const line = (id: QuestionId) => {
    const answer = answers[id];
    return answer ? answerLabel(t, id, answer) : t("trainer.question_flow.not_answered");
  };
  const parts = [
    t("trainer.question_flow.intake_message", {
      goal: line("goal"),
      days: line("days"),
      equipment: line("equipment"),
      experience: line("experience"),
      limitations: line("limitations"),
      minutes: args.sessionMinutes,
    }),
  ];
  if (args.note?.trim()) parts.push(t("trainer.question_flow.intake_note", { note: args.note.trim() }));
  return parts.join(" ");
}

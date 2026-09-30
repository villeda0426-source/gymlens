// Safety triage for the tap-only plan-setup flow (step 5, "Anything I should
// work around?"). This replaces the old physician-clearance gate that lived
// inside the Coach system prompt / free-text router: instead of asking the AI
// to guess intent from prose, the app already knows exactly which chips were
// tapped, so the outcome is a pure, testable mapping.
//
// Priority when more than one chip is selected (mockup allows multi-select):
// a hard stop always wins, then the "needs more detail" case, then the
// generic light/moderate case. This mirrors how a careful coach would triage
// a short intake form themselves.
export type LimitationChip =
  | "joint_or_muscle_pain"
  | "recent_injury_or_surgery"
  | "heart_condition_or_high_bp"
  | "chest_pain_or_dizziness"
  | "pregnant_or_postpartum"
  | "other_health_condition";

export const LIMITATION_CHIPS: LimitationChip[] = [
  "joint_or_muscle_pain",
  "recent_injury_or_surgery",
  "heart_condition_or_high_bp",
  "chest_pain_or_dizziness",
  "pregnant_or_postpartum",
  "other_health_condition",
];

export type PlanSetupTriage =
  // Nothing selected, or a hard stop was cleared via "I've been cleared".
  | { kind: "normal" }
  // Joint/muscle pain or a recent injury/surgery: ask which area, then avoid
  // or modify exercises that load it. Any other chips selected alongside
  // these still get folded into the light/moderate treatment once the area
  // follow-up is answered.
  | { kind: "needs_area_followup"; chips: LimitationChip[] }
  // Heart condition/high BP, another condition, or pregnancy with no acute
  // symptoms: build normally but at light-to-moderate intensity, and surface
  // one dismissible note.
  | { kind: "light_moderate"; chips: LimitationChip[] }
  // Chest pain or dizziness when active: do not generate a plan at all.
  | { kind: "blocked"; reason: "chest_pain_or_dizziness" };

export function triagePlanSetup(selected: LimitationChip[]): PlanSetupTriage {
  if (selected.length === 0) return { kind: "normal" };
  if (selected.includes("chest_pain_or_dizziness")) return { kind: "blocked", reason: "chest_pain_or_dizziness" };

  const needsArea = selected.filter(
    (chip) => chip === "joint_or_muscle_pain" || chip === "recent_injury_or_surgery"
  );
  if (needsArea.length > 0) return { kind: "needs_area_followup", chips: selected };

  return { kind: "light_moderate", chips: selected };
}

// Clearing the hard stop ("I've been cleared") re-triages the remaining
// chips as if chest_pain_or_dizziness had never been selected.
export function triageAfterClearance(selected: LimitationChip[]): PlanSetupTriage {
  return triagePlanSetup(selected.filter((chip) => chip !== "chest_pain_or_dizziness"));
}

export const CHIP_LABELS: Record<LimitationChip, { en: string; es: string }> = {
  joint_or_muscle_pain: { en: "Joint or muscle pain", es: "Dolor articular o muscular" },
  recent_injury_or_surgery: { en: "Recent injury or surgery", es: "Lesión o cirugía reciente" },
  heart_condition_or_high_bp: { en: "Heart condition or high BP", es: "Condición cardíaca o presión alta" },
  chest_pain_or_dizziness: { en: "Chest pain or dizziness when active", es: "Dolor de pecho o mareo al estar activo" },
  pregnant_or_postpartum: { en: "Pregnant or postpartum", es: "Embarazada o posparto" },
  other_health_condition: { en: "Other health condition", es: "Otra condición de salud" },
};

// Human-readable phrase per chip, used to build the one rich synthetic intake
// message the tap flow sends to the plan generator (see store/planSetupStore.ts).
// Deliberately plain, factual phrasing — no diagnosis, no severity language.
export function describeChipForCoach(chip: LimitationChip, language: "en" | "es", area?: string): string {
  const withArea = (en: string, es: string) =>
    language === "es" ? (area ? `${es} (${area})` : es) : area ? `${en} (${area})` : en;

  switch (chip) {
    case "joint_or_muscle_pain":
      return withArea("joint or muscle pain", "dolor articular o muscular");
    case "recent_injury_or_surgery":
      return withArea("a recent injury or surgery", "una lesión o cirugía reciente");
    case "heart_condition_or_high_bp":
      return language === "es" ? "una condición cardíaca o presión alta" : "a heart condition or high blood pressure";
    case "chest_pain_or_dizziness":
      return language === "es" ? "dolor de pecho o mareo al estar activo" : "chest pain or dizziness when active";
    case "pregnant_or_postpartum":
      return language === "es" ? "está embarazada o en posparto" : "is pregnant or postpartum";
    case "other_health_condition":
      return language === "es" ? "otra condición de salud" : "another health condition";
    default:
      return chip;
  }
}

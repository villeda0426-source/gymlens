// Tap-only plan-setup wizard (Main/Days/Where/Experience/Body/Ready in
// docs/design/build-my-plan/). Transient wizard state only — the durable
// record is the Supabase `profiles` row (and `user_consents`/
// `user_limitations` when the person allows it), written once in submit().
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { runCoachTrainerJob, type CoachLanguage, type CoachResponse, type Units } from "@/lib/coachTrainer";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import {
  describeChipForCoach,
  triageAfterClearance,
  triagePlanSetup,
  type LimitationChip,
  type PlanSetupTriage,
} from "@/shared/planSetupTriage";
import { buildTemplatePlan, extractAreasFromText } from "@/shared/buildTemplatePlan";

export type PlanSetupGoal = "strength" | "hypertrophy" | "fat_loss" | "general_fitness";
export type PlanSetupLocation = "full_gym" | "dumbbells_home" | "bodyweight";
export type PlanSetupExperience = "beginner" | "intermediate" | "advanced";
export type SessionMinutes = 30 | 45 | 60;

// Bump this and update copy together — it's what gets written to
// user_consents.policy_version, so it must stay a stable, short string.
export const HEALTH_DATA_CONSENT_VERSION = "2026-09-28";

type BuildStatus = "idle" | "building" | "ready" | "error";

interface PlanSetupState {
  goal: PlanSetupGoal | null;
  daysPerWeek: number | null;
  sessionMinutes: SessionMinutes | null;
  location: PlanSetupLocation | null;
  experience: PlanSetupExperience | null;
  limitations: LimitationChip[];
  limitationArea: string;
  chestPainCleared: boolean;
  // null = not asked yet this session. Only meaningful once at least one
  // non-"nothing" chip has been selected.
  consentGranted: boolean | null;
  buildStatus: BuildStatus;
  buildError: string | null;

  setGoal: (goal: PlanSetupGoal) => void;
  setDaysPerWeek: (days: number) => void;
  setSessionMinutes: (minutes: SessionMinutes) => void;
  setLocation: (location: PlanSetupLocation) => void;
  setExperience: (experience: PlanSetupExperience) => void;
  setLimitations: (chips: LimitationChip[]) => void;
  setLimitationArea: (area: string) => void;
  setChestPainCleared: (cleared: boolean) => void;
  setConsentGranted: (granted: boolean | null) => void;
  triage: () => PlanSetupTriage;
  reset: () => void;
  beginFromProfile: (profile: Record<string, unknown> | null) => void;
  isComplete: () => boolean;
  submit: (args: { authToken: string; language: CoachLanguage; units: Units }) => Promise<CoachResponse>;
}

const initial = {
  goal: null as PlanSetupGoal | null,
  daysPerWeek: null as number | null,
  sessionMinutes: null as SessionMinutes | null,
  location: null as PlanSetupLocation | null,
  experience: null as PlanSetupExperience | null,
  limitations: [] as LimitationChip[],
  limitationArea: "",
  chestPainCleared: false,
  consentGranted: null as boolean | null,
  buildStatus: "idle" as BuildStatus,
  buildError: null as string | null,
};

function asGoal(value: unknown): PlanSetupGoal | null {
  return value === "strength" || value === "hypertrophy" || value === "fat_loss" || value === "general_fitness"
    ? value
    : null;
}

function asLocation(value: unknown): PlanSetupLocation | null {
  return value === "full_gym" || value === "dumbbells_home" || value === "bodyweight" ? value : null;
}

function asExperience(value: unknown): PlanSetupExperience | null {
  return value === "beginner" || value === "intermediate" || value === "advanced" ? value : null;
}

function buildSyntheticIntakeMessage(args: {
  goal: PlanSetupGoal;
  daysPerWeek: number;
  sessionMinutes: SessionMinutes;
  location: PlanSetupLocation;
  experience: PlanSetupExperience;
  limitationText: string;
  language: CoachLanguage;
}): string {
  const { goal, daysPerWeek, sessionMinutes, location, experience, limitationText, language } = args;
  if (language === "es") {
    const goalText: Record<PlanSetupGoal, string> = {
      strength: "ganar fuerza",
      hypertrophy: "ganar músculo",
      fat_loss: "perder grasa",
      general_fitness: "estar en forma en general",
    };
    const locationText: Record<PlanSetupLocation, string> = {
      full_gym: "un gimnasio completo",
      dumbbells_home: "mancuernas en casa",
      bodyweight: "solo peso corporal, sin equipo",
    };
    const experienceText: Record<PlanSetupExperience, string> = {
      beginner: "principiante, nunca he entrenado o ha pasado más de un año",
      intermediate: "nivel intermedio, he entrenado de forma intermitente",
      advanced: "avanzado, entreno la mayoría de las semanas y conozco los fundamentos",
    };
    return `Mi objetivo principal es ${goalText[goal]}. Puedo entrenar ${daysPerWeek} días por semana, ${sessionMinutes} minutos por sesión. Entreno con ${locationText[location]}. Nivel: ${experienceText[experience]}. ${limitationText}`;
  }

  const goalText: Record<PlanSetupGoal, string> = {
    strength: "get stronger",
    hypertrophy: "build muscle",
    fat_loss: "lose fat",
    general_fitness: "feel fitter overall",
  };
  const locationText: Record<PlanSetupLocation, string> = {
    full_gym: "a full gym",
    dumbbells_home: "dumbbells at home",
    bodyweight: "bodyweight only, no equipment",
  };
  const experienceText: Record<PlanSetupExperience, string> = {
    beginner: "brand new, I've never really lifted or it's been over a year",
    intermediate: "some experience, I've trained on and off",
    advanced: "consistent, I train most weeks and know the basics",
  };
  return `My main goal is to ${goalText[goal]}. I can train ${daysPerWeek} days a week, ${sessionMinutes} minutes a session. I train with ${locationText[location]}. Experience: ${experienceText[experience]}. ${limitationText}`;
}

function limitationSentence(
  triage: PlanSetupTriage,
  limitations: LimitationChip[],
  limitationArea: string,
  consentGranted: boolean | null,
  language: CoachLanguage
): string {
  if (triage.kind === "normal") {
    return language === "es" ? "No tiene lesiones, dolor ni limitaciones." : "No injuries, pain, or limitations.";
  }

  if (consentGranted === false) {
    // Decision: decline consent -> don't share specifics, but still build
    // conservatively. "condition" (not "consideration") deliberately matches
    // the router's medical risk pattern so this always reaches the AI.
    return language === "es"
      ? "Marcó una condición de salud pero prefirió no compartir detalles. Arma un plan a intensidad ligera a moderada sin adaptarlo a algo específico."
      : "Flagged a health condition but chose not to share details. Build a light-to-moderate intensity plan without tailoring it to anything specific.";
  }

  const parts = limitations
    .filter((chip) => chip !== "chest_pain_or_dizziness")
    .map((chip) => describeChipForCoach(chip, language, limitationArea || undefined));
  const joined = parts.join(language === "es" ? " y " : " and ");
  return language === "es" ? `Tiene ${joined}.` : `Has ${joined}.`;
}

export const usePlanSetupStore = create<PlanSetupState>((set, get) => ({
  ...initial,

  setGoal: (goal) => set({ goal }),
  setDaysPerWeek: (daysPerWeek) => set({ daysPerWeek }),
  setSessionMinutes: (sessionMinutes) => set({ sessionMinutes }),
  setLocation: (location) => set({ location }),
  setExperience: (experience) => set({ experience }),
  setLimitations: (limitations) => set({ limitations }),
  setLimitationArea: (limitationArea) => set({ limitationArea }),
  setChestPainCleared: (chestPainCleared) => set({ chestPainCleared }),
  setConsentGranted: (consentGranted) => set({ consentGranted }),

  triage: () => {
    const { limitations, chestPainCleared } = get();
    return chestPainCleared ? triageAfterClearance(limitations) : triagePlanSetup(limitations);
  },

  reset: () => set({ ...initial }),

  // "Rebuild my plan" from the Coach ••• menu: prefill from what's already
  // known so the person isn't re-answering from scratch. Health limitations
  // are never prefilled — they're re-asked fresh every time, by design.
  beginFromProfile: (profile) => {
    set({
      ...initial,
      goal: asGoal(profile?.goal),
      daysPerWeek: typeof profile?.days_per_week === "number" ? (profile.days_per_week as number) : null,
      sessionMinutes: ([30, 45, 60] as const).includes(profile?.session_minutes as SessionMinutes)
        ? (profile!.session_minutes as SessionMinutes)
        : null,
      location: asLocation(profile?.equipment_type),
      experience: asExperience(profile?.experience_level),
    });
  },

  isComplete: () => {
    const s = get();
    return !!(s.goal && s.daysPerWeek && s.sessionMinutes && s.location && s.experience);
  },

  submit: async ({ authToken, language, units }) => {
    const state = get();
    if (!state.goal || !state.daysPerWeek || !state.sessionMinutes || !state.location || !state.experience) {
      throw new Error("Plan setup answers are incomplete.");
    }

    set({ buildStatus: "building", buildError: null });

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("You need to be signed in.");
      const userId = userData.user.id;

      const triage = state.chestPainCleared ? triageAfterClearance(state.limitations) : triagePlanSetup(state.limitations);
      if (triage.kind === "blocked") {
        // The UI must never call submit() while blocked; this is a backstop.
        throw new Error("Plan setup is blocked pending clearance.");
      }

      const nowIso = new Date().toISOString();
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          goal: state.goal,
          days_per_week: state.daysPerWeek,
          session_minutes: state.sessionMinutes,
          equipment_type: state.location,
          experience_level: state.experience,
          // Step 5 IS the safety review. Nothing reads this column back yet
          // on this branch (the account-history-aware Coach backend that
          // would is a separate, later change) — it's recorded now so that
          // work has real data to read whenever it lands.
          safety_reviewed_at: nowIso,
        })
        .eq("id", userId);
      if (profileError) throw profileError;

      const storableLimitations = state.limitations.filter((chip) => chip !== "chest_pain_or_dizziness");
      if (state.consentGranted === true && storableLimitations.length > 0) {
        const { error: consentError } = await supabase.from("user_consents").upsert(
          {
            user_id: userId,
            consent_type: "health_data",
            policy_version: HEALTH_DATA_CONSENT_VERSION,
            granted_at: nowIso,
            withdrawn_at: null,
          },
          { onConflict: "user_id,consent_type,policy_version" }
        );
        if (consentError) throw consentError;

        const { error: limitationsError } = await supabase.from("user_limitations").insert(
          storableLimitations.map((chip) => ({
            user_id: userId,
            limitation_type: chip,
            details:
              chip === "joint_or_muscle_pain" || chip === "recent_injury_or_surgery"
                ? state.limitationArea.trim() || null
                : null,
            active: true,
          }))
        );
        if (limitationsError) throw limitationsError;
      }

      const limitationText = limitationSentence(triage, state.limitations, state.limitationArea, state.consentGranted, language);

      // QA #9: the tap-only flow already has goal/days/equipment/experience/
      // limitations as structured fields, not prose — build the plan straight
      // from shared/coachProgramming.ts's evidence-based templates instead of
      // asking the AI to generate one from scratch. Falls back to the AI path
      // only if the template engine can't produce a plan for this input (it
      // shouldn't, given the UI's own option set, but this must never leave
      // someone with no plan over an edge case the templates don't cover).
      const templatePlan = buildTemplatePlan({
        goal: state.goal,
        daysPerWeek: state.daysPerWeek,
        sessionMinutes: state.sessionMinutes,
        location: state.location,
        experience: state.experience,
        avoidAreas: extractAreasFromText(state.limitationArea),
        lightModerate: triage.kind === "light_moderate",
        units,
        language,
      });

      let response: CoachResponse;
      if (templatePlan) {
        response = {
          status: "plan_ready",
          summary: templatePlan.weekly_notes,
          plan: templatePlan,
        };
      } else {
        const userMessage = buildSyntheticIntakeMessage({
          goal: state.goal,
          daysPerWeek: state.daysPerWeek,
          sessionMinutes: state.sessionMinutes,
          location: state.location,
          experience: state.experience,
          limitationText,
          language,
        });
        response = await runCoachTrainerJob(
          { mode: "intake", units, language, history: [], userMessage },
          { authToken }
        );
      }

      if (response.status === "plan_ready") {
        useCoachTrainerStore.getState().setPlan(response.plan);
        set({ buildStatus: "ready" });
      } else {
        const message = "message" in response ? response.message : "Coach could not build a plan from those answers.";
        set({ buildStatus: "error", buildError: message });
      }
      return response;
    } catch (err: any) {
      set({ buildStatus: "error", buildError: err?.message || "Something went wrong. Please try again." });
      throw err;
    }
  },
}));

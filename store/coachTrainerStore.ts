import { normalizePlanTimeline } from "@/shared/planTimeline";
import { migrateCompletionIds } from "@/shared/completionKeys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { CoachMessage, CoachPlan, CoachResponse, CoachRulesMetadata, Units } from "@/lib/coachTrainer";

const STORAGE_KEY = "coachlift_ai_trainer_state_v1";

export type TrainerConversation = CoachMessage & {
  id: string;
  createdAt: string;
  rulesMetadata?: CoachRulesMetadata;
  feedbackFlaggedAt?: string;
};

// A Coach-suggested edit to the saved plan, staged from the chat/adapt/
// update_goals path. Never applied to `plan` until the user explicitly taps
// "Apply today" (CoachSuggestionCard) — see Phase 3 of the Coach Forward plan.
export type PendingPlanChange = Extract<CoachResponse, { status: "plan_updated" }>;

export type CoachAvatarConfig = {
  skinTone: "light" | "medium" | "deep";
  bodyType: "lean" | "athletic" | "strong";
  hairStyle: "short" | "curly" | "fade";
  facialHair: "none" | "stubble" | "beard";
  outfit: "navy" | "coral" | "black";
  createdAt: string;
};

interface CoachTrainerState {
  units: Units;
  plan: CoachPlan | null;
  coachAvatar: CoachAvatarConfig | null;
  hasEnteredCoachChat: boolean;
  failedPrompt: string | null;
  completedExerciseIds: string[];
  intakeHistory: CoachMessage[];
  conversation: TrainerConversation[];
  pendingPlanChange: PendingPlanChange | null;
  hasLoaded: boolean;
  setUnits: (units: Units) => void;
  setPlan: (plan: CoachPlan | null) => void;
  updatePlan: (plan: CoachPlan) => void;
  setCoachAvatar: (avatar: Omit<CoachAvatarConfig, "createdAt">) => void;
  enterCoachChat: () => void;
  leaveCoachChat: () => void;
  setFailedPrompt: (prompt: string | null) => void;
  markExerciseCompleted: (exerciseId: string) => void;
  unmarkExerciseCompleted: (exerciseId: string) => void;
  setIntakeHistory: (history: CoachMessage[]) => void;
  addConversationMessage: (message: CoachMessage, rulesMetadata?: CoachRulesMetadata) => void;
  markConversationFeedbackFlagged: (id: string) => void;
  setPendingPlanChange: (change: PendingPlanChange | null) => void;
  applyPendingPlanChange: () => void;
  dismissPendingPlanChange: () => void;
  resetChatSession: () => void;
  clearTrainer: () => void;
  loadTrainer: () => Promise<void>;
}

function makeConversationMessage(message: CoachMessage, rulesMetadata?: CoachRulesMetadata): TrainerConversation {
  return {
    ...message,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    rulesMetadata,
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}



async function persist(
  state: Pick<
    CoachTrainerState,
    | "units"
    | "plan"
    | "coachAvatar"
    | "hasEnteredCoachChat"
    | "failedPrompt"
    | "completedExerciseIds"
    | "intakeHistory"
    | "conversation"
    | "pendingPlanChange"
  >
) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useCoachTrainerStore = create<CoachTrainerState>((set, get) => ({
  units: "lbs",
  plan: null,
  coachAvatar: null,
  hasEnteredCoachChat: false,
  failedPrompt: null,
  completedExerciseIds: [],
  intakeHistory: [],
  conversation: [],
  pendingPlanChange: null,
  hasLoaded: false,

  setUnits: (units) => {
    set({ units });
    persist(get());
  },

  setPlan: (plan) => {
    set({ plan: normalizePlanTimeline(plan), completedExerciseIds: [] });
    persist(get());
  },

  updatePlan: (plan) => {
    set({ plan: normalizePlanTimeline(plan) });
    persist(get());
  },

  setCoachAvatar: (avatar) => {
    set({ coachAvatar: { ...avatar, createdAt: new Date().toISOString() }, hasEnteredCoachChat: false });
    persist(get());
  },

  enterCoachChat: () => {
    set({ hasEnteredCoachChat: true, failedPrompt: null });
    persist(get());
  },

  leaveCoachChat: () => {
    set({ hasEnteredCoachChat: false });
    persist(get());
  },

  setFailedPrompt: (failedPrompt) => {
    set({ failedPrompt });
    persist(get());
  },

  markExerciseCompleted: (exerciseId) => {
    set((state) => {
      if (state.completedExerciseIds.includes(exerciseId)) return state;
      return { completedExerciseIds: [...state.completedExerciseIds, exerciseId] };
    });
    persist(get());
  },

  unmarkExerciseCompleted: (exerciseId) => {
    set((state) => ({
      completedExerciseIds: state.completedExerciseIds.filter((id) => id !== exerciseId),
    }));
    persist(get());
  },

  setIntakeHistory: (intakeHistory) => {
    set({ intakeHistory });
    persist(get());
  },

  addConversationMessage: (message, rulesMetadata) => {
    set((state) => ({ conversation: [...state.conversation, makeConversationMessage(message, rulesMetadata)] }));
    persist(get());
  },

  markConversationFeedbackFlagged: (id) => {
    set((state) => ({ conversation: state.conversation.map((message) => message.id === id ? { ...message, feedbackFlaggedAt: new Date().toISOString() } : message) }));
    persist(get());
  },

  setPendingPlanChange: (pendingPlanChange) => {
    set({ pendingPlanChange });
    persist(get());
  },

  applyPendingPlanChange: () => {
    const { pendingPlanChange } = get();
    if (!pendingPlanChange) return;
    set({ plan: normalizePlanTimeline(pendingPlanChange.plan), pendingPlanChange: null });
    persist(get());
  },

  dismissPendingPlanChange: () => {
    set({ pendingPlanChange: null });
    persist(get());
  },

  resetChatSession: () => {
    const next = { conversation: [], intakeHistory: [], hasEnteredCoachChat: false, failedPrompt: null, pendingPlanChange: null };
    set(next);
    persist(get());
  },

  clearTrainer: () => {
    const next = {
      units: get().units,
      plan: null,
      coachAvatar: null,
      hasEnteredCoachChat: false,
      failedPrompt: null,
      completedExerciseIds: [],
      intakeHistory: [],
      conversation: [],
      pendingPlanChange: null,
    };
    set(next);
    persist(next);
  },

  loadTrainer: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      set({ hasLoaded: true });
      return;
    }

    try {
      const saved = JSON.parse(raw);
      set({
        units: saved.units === "kg" ? "kg" : "lbs",
        plan: normalizePlanTimeline(saved.plan ?? null),
        coachAvatar: saved.coachAvatar ?? null,
        hasEnteredCoachChat: saved.hasEnteredCoachChat === true,
        failedPrompt: typeof saved.failedPrompt === "string" ? saved.failedPrompt : null,
        completedExerciseIds: migrateCompletionIds(
          normalizePlanTimeline(saved.plan ?? null)?.sessions,
          Array.isArray(saved.completedExerciseIds) ? saved.completedExerciseIds : []
        ),
        intakeHistory: Array.isArray(saved.intakeHistory) ? saved.intakeHistory : [],
        conversation: Array.isArray(saved.conversation) ? saved.conversation : [],
        pendingPlanChange: saved.pendingPlanChange?.status === "plan_updated" ? saved.pendingPlanChange : null,
        hasLoaded: true,
      });
    } catch {
      set({ hasLoaded: true });
    }
  },
}));

import { normalizePlanTimeline } from "@/shared/planTimeline";
import { migrateCompletionIds } from "@/shared/completionKeys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { CoachMessage, CoachPlan, Units } from "@/lib/coachTrainer";

const STORAGE_KEY = "coachlift_ai_trainer_state_v1";

type TrainerConversation = CoachMessage & {
  id: string;
  createdAt: string;
};

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
  addConversationMessage: (message: CoachMessage) => void;
  resetChatSession: () => void;
  clearTrainer: () => void;
  loadTrainer: () => Promise<void>;
}

function makeConversationMessage(message: CoachMessage): TrainerConversation {
  return {
    ...message,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
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

  addConversationMessage: (message) => {
    set((state) => ({ conversation: [...state.conversation, makeConversationMessage(message)] }));
    persist(get());
  },

  resetChatSession: () => {
    const next = { conversation: [], intakeHistory: [], hasEnteredCoachChat: false, failedPrompt: null };
    set(next);
    persist(get());
  },

  clearTrainer: () => {
    const next = {
      units: get().units,
      plan: null,
      coachAvatar: get().coachAvatar,
      hasEnteredCoachChat: false,
      failedPrompt: null,
      completedExerciseIds: [],
      intakeHistory: [],
      conversation: [],
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
        hasLoaded: true,
      });
    } catch {
      set({ hasLoaded: true });
    }
  },
}));

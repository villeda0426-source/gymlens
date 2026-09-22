import { normalizePlanTimeline } from "@/shared/planTimeline";
import { migrateCompletionIds } from "@/shared/completionKeys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { CoachMessage, CoachPlan, CoachRulesMetadata, Units } from "@/lib/coachTrainer";

// v1 stored every person's Coach state under one device-wide key. Do not read
// it again: retaining a signed-in person's conversation for the next person on
// the device is not an acceptable migration path.
const LEGACY_STORAGE_KEY = "coachlift_ai_trainer_state_v1";
const STORAGE_KEY_PREFIX = "coachlift_ai_trainer_state_v2";

let activeStorageScope = "guest";
let storageRevision = 0;
let legacyStorageRetired = false;

export type TrainerConversation = CoachMessage & {
  id: string;
  createdAt: string;
  rulesMetadata?: CoachRulesMetadata;
  feedbackFlaggedAt?: string;
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
  addConversationMessage: (message: CoachMessage, rulesMetadata?: CoachRulesMetadata) => string;
  markConversationFeedbackFlagged: (conversationId: string) => void;
  resetChatSession: () => void;
  clearTrainer: () => void;
  setStorageScope: (userId: string | null | undefined) => Promise<void>;
  loadTrainer: () => Promise<void>;
}

type PersistedCoachTrainerState = Pick<
  CoachTrainerState,
  | "units"
  | "plan"
  | "coachAvatar"
  | "hasEnteredCoachChat"
  | "failedPrompt"
  | "completedExerciseIds"
  | "intakeHistory"
  | "conversation"
>;

function storageKey(scope = activeStorageScope): string {
  return `${STORAGE_KEY_PREFIX}:${scope}`;
}

function makeEmptyTrainerState() {
  return {
    units: "lbs" as Units,
    plan: null,
    coachAvatar: null,
    hasEnteredCoachChat: false,
    failedPrompt: null,
    completedExerciseIds: [],
    intakeHistory: [],
    conversation: [],
  };
}

function makeConversationMessage(
  message: CoachMessage,
  rulesMetadata?: CoachRulesMetadata
): TrainerConversation {
  return {
    ...message,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...(rulesMetadata ? { rulesMetadata } : {}),
  };
}

function isRulesMetadata(value: unknown): value is CoachRulesMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<CoachRulesMetadata>;
  return metadata.rulesHandled === true && typeof metadata.routeReason === "string";
}

function readConversation(value: unknown): TrainerConversation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const message = item as Partial<TrainerConversation>;
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      typeof message.id !== "string" ||
      typeof message.createdAt !== "string"
    ) {
      return [];
    }

    return [{
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      ...(isRulesMetadata(message.rulesMetadata) ? { rulesMetadata: message.rulesMetadata } : {}),
      ...(typeof message.feedbackFlaggedAt === "string"
        ? { feedbackFlaggedAt: message.feedbackFlaggedAt }
        : {}),
    }];
  });
}

async function retireLegacyStorage(): Promise<void> {
  if (legacyStorageRetired) return;
  legacyStorageRetired = true;
  try {
    await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // The legacy key is never read, even if the device declines to remove it.
  }
}

async function persist(state: PersistedCoachTrainerState, scope = activeStorageScope) {
  await AsyncStorage.setItem(storageKey(scope), JSON.stringify(state));
}

export const useCoachTrainerStore = create<CoachTrainerState>((set, get) => {
  const loadScope = async (scope: string, revision: number) => {
    await retireLegacyStorage();

    try {
      const raw = await AsyncStorage.getItem(storageKey(scope));
      if (revision !== storageRevision || scope !== activeStorageScope) return;

      if (!raw) {
        set({ hasLoaded: true });
        return;
      }

      const saved = JSON.parse(raw) as Partial<PersistedCoachTrainerState>;
      const plan = normalizePlanTimeline(saved.plan ?? null);
      set({
        units: saved.units === "kg" ? "kg" : "lbs",
        plan,
        coachAvatar: saved.coachAvatar ?? null,
        hasEnteredCoachChat: saved.hasEnteredCoachChat === true,
        failedPrompt: typeof saved.failedPrompt === "string" ? saved.failedPrompt : null,
        completedExerciseIds: migrateCompletionIds(
          plan?.sessions,
          Array.isArray(saved.completedExerciseIds) ? saved.completedExerciseIds : []
        ),
        intakeHistory: Array.isArray(saved.intakeHistory) ? saved.intakeHistory : [],
        conversation: readConversation(saved.conversation),
        hasLoaded: true,
      });
    } catch {
      if (revision === storageRevision && scope === activeStorageScope) {
        set({ hasLoaded: true });
      }
    }
  };

  return {
    ...makeEmptyTrainerState(),
    hasLoaded: false,

    setUnits: (units) => {
      const scope = activeStorageScope;
      set({ units });
      void persist(get(), scope);
    },

    setPlan: (plan) => {
      const scope = activeStorageScope;
      set({ plan: normalizePlanTimeline(plan), completedExerciseIds: [] });
      void persist(get(), scope);
    },

    updatePlan: (plan) => {
      const scope = activeStorageScope;
      set({ plan: normalizePlanTimeline(plan) });
      void persist(get(), scope);
    },

    setCoachAvatar: (avatar) => {
      const scope = activeStorageScope;
      set({ coachAvatar: { ...avatar, createdAt: new Date().toISOString() }, hasEnteredCoachChat: false });
      void persist(get(), scope);
    },

    enterCoachChat: () => {
      const scope = activeStorageScope;
      set({ hasEnteredCoachChat: true, failedPrompt: null });
      void persist(get(), scope);
    },

    leaveCoachChat: () => {
      const scope = activeStorageScope;
      set({ hasEnteredCoachChat: false });
      void persist(get(), scope);
    },

    setFailedPrompt: (failedPrompt) => {
      const scope = activeStorageScope;
      set({ failedPrompt });
      void persist(get(), scope);
    },

    markExerciseCompleted: (exerciseId) => {
      const scope = activeStorageScope;
      set((state) => {
        if (state.completedExerciseIds.includes(exerciseId)) return state;
        return { completedExerciseIds: [...state.completedExerciseIds, exerciseId] };
      });
      void persist(get(), scope);
    },

    unmarkExerciseCompleted: (exerciseId) => {
      const scope = activeStorageScope;
      set((state) => ({
        completedExerciseIds: state.completedExerciseIds.filter((id) => id !== exerciseId),
      }));
      void persist(get(), scope);
    },

    setIntakeHistory: (intakeHistory) => {
      const scope = activeStorageScope;
      set({ intakeHistory });
      void persist(get(), scope);
    },

    addConversationMessage: (message, rulesMetadata) => {
      const scope = activeStorageScope;
      const conversationMessage = makeConversationMessage(message, rulesMetadata);
      set((state) => ({ conversation: [...state.conversation, conversationMessage] }));
      void persist(get(), scope);
      return conversationMessage.id;
    },

    markConversationFeedbackFlagged: (conversationId) => {
      const scope = activeStorageScope;
      set((state) => ({
        conversation: state.conversation.map((message) =>
          message.id === conversationId
            ? { ...message, feedbackFlaggedAt: new Date().toISOString() }
            : message
        ),
      }));
      void persist(get(), scope);
    },

    resetChatSession: () => {
      const scope = activeStorageScope;
      set({ conversation: [], intakeHistory: [], hasEnteredCoachChat: false, failedPrompt: null });
      void persist(get(), scope);
    },

    clearTrainer: () => {
      const scope = activeStorageScope;
      const next = makeEmptyTrainerState();
      set(next);
      void persist(next, scope);
    },

    setStorageScope: async (userId) => {
      const nextScope = userId?.trim() || "guest";
      if (nextScope === activeStorageScope) {
        if (!get().hasLoaded) await loadScope(nextScope, storageRevision);
        return;
      }

      activeStorageScope = nextScope;
      const revision = ++storageRevision;
      set({ ...makeEmptyTrainerState(), hasLoaded: false });
      await loadScope(nextScope, revision);
    },

    loadTrainer: async () => {
      await loadScope(activeStorageScope, storageRevision);
    },
  };
});

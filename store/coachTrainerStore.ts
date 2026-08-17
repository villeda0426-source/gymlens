import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { CoachMessage, CoachPlan, Units } from "@/lib/coachTrainer";

const STORAGE_KEY = "coachlift_ai_trainer_state_v1";

export type TrainerConversation = CoachMessage & {
  id: string;
  createdAt: string;
};

export type CoachTrainerThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  units: Units;
  plan: CoachPlan | null;
  completedExerciseIds: string[];
  intakeHistory: CoachMessage[];
  conversation: TrainerConversation[];
  latestWorkoutReview: CoachWorkoutReview | null;
};

export type CoachWorkoutReview = {
  sessionLabel: string;
  source: "rules" | "ai";
  reason: string;
  changes: string[];
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
  latestWorkoutReview: CoachWorkoutReview | null;
  threads: CoachTrainerThread[];
  activeThreadId: string | null;
  hasLoaded: boolean;
  setUnits: (units: Units) => void;
  setPlan: (plan: CoachPlan | null) => void;
  updatePlan: (plan: CoachPlan) => void;
  setCoachAvatar: (avatar: Omit<CoachAvatarConfig, "createdAt">) => void;
  enterCoachChat: () => void;
  leaveCoachChat: () => void;
  openTrainerLibrary: () => void;
  selectThread: (threadId: string) => void;
  startNewThread: () => void;
  setFailedPrompt: (prompt: string | null) => void;
  markExerciseCompleted: (exerciseId: string) => void;
  unmarkExerciseCompleted: (exerciseId: string) => void;
  setIntakeHistory: (history: CoachMessage[]) => void;
  addConversationMessage: (message: CoachMessage) => void;
  setLatestWorkoutReview: (review: Omit<CoachWorkoutReview, "createdAt"> | null) => void;
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

function makeThreadId(): string {
  return `coach-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function threadTitle(plan: CoachPlan | null, conversation: TrainerConversation[]): string {
  if (plan?.goal?.trim()) return plan.goal.trim();
  const firstPrompt = conversation.find((message) => message.role === "user")?.content.trim();
  if (firstPrompt) return firstPrompt.length > 44 ? `${firstPrompt.slice(0, 44).trim()}…` : firstPrompt;
  return "New coaching plan";
}

function syncActiveThread(
  state: CoachTrainerState,
  changes: Partial<Pick<CoachTrainerState, "units" | "plan" | "completedExerciseIds" | "intakeHistory" | "conversation" | "latestWorkoutReview">>
) {
  const now = new Date().toISOString();
  const activeThreadId = state.activeThreadId ?? makeThreadId();
  const plan = changes.plan !== undefined ? changes.plan : state.plan;
  const conversation = changes.conversation ?? state.conversation;
  const thread: CoachTrainerThread = {
    id: activeThreadId,
    title: threadTitle(plan, conversation),
    createdAt: state.threads.find((item) => item.id === activeThreadId)?.createdAt ?? now,
    updatedAt: now,
    units: changes.units ?? state.units,
    plan,
    completedExerciseIds: changes.completedExerciseIds ?? state.completedExerciseIds,
    intakeHistory: changes.intakeHistory ?? state.intakeHistory,
    conversation,
    latestWorkoutReview: changes.latestWorkoutReview !== undefined ? changes.latestWorkoutReview : state.latestWorkoutReview,
  };
  return {
    activeThreadId,
    threads: [thread, ...state.threads.filter((item) => item.id !== activeThreadId)],
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stripSchedulePrefix(value: string): string {
  return value
    .replace(/^(?:(?:Week\s*\d+\s+)?Day\s*\d+\s*[-–:]\s*)+/i, "")
    .trim();
}

function normalizePlanTimeline(plan: CoachPlan | null): CoachPlan | null {
  if (!plan) return null;

  const daysPerWeek = Math.max(1, Math.round(plan.days_per_week || 1));
  const weeks = Math.max(1, Math.round(plan.timeline_weeks || 1));
  const expectedSessions = daysPerWeek * weeks;
  const normalizedPlan: CoachPlan = {
    ...plan,
    sessions: plan.sessions.map((session, index) => {
      const week = Math.floor(index / daysPerWeek) + 1;
      const dayInWeek = (index % daysPerWeek) + 1;
      const baseLabel = stripSchedulePrefix(session.day_label) || session.focus;
      return { ...session, day_label: `Week ${week} Day ${dayInWeek} - ${baseLabel}` };
    }),
  };

  if (normalizedPlan.sessions.length >= expectedSessions || normalizedPlan.sessions.length === 0) {
    return normalizedPlan;
  }

  const weeklyTemplate = normalizedPlan.sessions.slice(0, Math.min(daysPerWeek, normalizedPlan.sessions.length));
  if (weeklyTemplate.length === 0) return normalizedPlan;

  const sessions = Array.from({ length: expectedSessions }, (_, index) => {
    const template = weeklyTemplate[index % weeklyTemplate.length];
    const week = Math.floor(index / daysPerWeek) + 1;
    const dayInWeek = (index % daysPerWeek) + 1;
    const baseLabel = stripSchedulePrefix(template.day_label) || template.focus;

    return {
      ...template,
      day_label: `Week ${week} Day ${dayInWeek} - ${baseLabel}`,
      exercises: template.exercises.map((exercise) => ({
        ...exercise,
        exercise_id: week === 1
          ? exercise.exercise_id
          : `${exercise.exercise_id || slugify(exercise.name)}-w${week}`,
      })),
    };
  });

  return { ...normalizedPlan, sessions };
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
    | "latestWorkoutReview"
    | "threads"
    | "activeThreadId"
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
  latestWorkoutReview: null,
  threads: [],
  activeThreadId: null,
  hasLoaded: false,

  setUnits: (units) => {
    set((state) => ({ units, ...syncActiveThread(state, { units }) }));
    persist(get());
  },

  setPlan: (plan) => {
    set((state) => {
      const normalizedPlan = normalizePlanTimeline(plan);
      return { plan: normalizedPlan, completedExerciseIds: [], ...syncActiveThread(state, { plan: normalizedPlan, completedExerciseIds: [] }) };
    });
    persist(get());
  },

  updatePlan: (plan) => {
    set((state) => {
      const normalizedPlan = normalizePlanTimeline(plan);
      return { plan: normalizedPlan, ...syncActiveThread(state, { plan: normalizedPlan }) };
    });
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

  openTrainerLibrary: () => {
    set({ hasEnteredCoachChat: false });
    persist(get());
  },

  selectThread: (threadId) => {
    const thread = get().threads.find((item) => item.id === threadId);
    if (!thread) return;
    set({
      activeThreadId: thread.id,
      units: thread.units,
      plan: normalizePlanTimeline(thread.plan),
      completedExerciseIds: thread.completedExerciseIds,
      intakeHistory: thread.intakeHistory,
      conversation: thread.conversation,
      latestWorkoutReview: thread.latestWorkoutReview,
      failedPrompt: null,
      hasEnteredCoachChat: true,
    });
    persist(get());
  },

  startNewThread: () => {
    set({
      activeThreadId: null,
      plan: null,
      completedExerciseIds: [],
      intakeHistory: [],
      conversation: [],
      latestWorkoutReview: null,
      failedPrompt: null,
      hasEnteredCoachChat: true,
    });
    persist(get());
  },

  setFailedPrompt: (failedPrompt) => {
    set({ failedPrompt });
    persist(get());
  },

  markExerciseCompleted: (exerciseId) => {
    set((state) => {
      if (state.completedExerciseIds.includes(exerciseId)) return state;
      const completedExerciseIds = [...state.completedExerciseIds, exerciseId];
      return { completedExerciseIds, ...syncActiveThread(state, { completedExerciseIds }) };
    });
    persist(get());
  },

  unmarkExerciseCompleted: (exerciseId) => {
    set((state) => {
      const completedExerciseIds = state.completedExerciseIds.filter((id) => id !== exerciseId);
      return { completedExerciseIds, ...syncActiveThread(state, { completedExerciseIds }) };
    });
    persist(get());
  },

  setIntakeHistory: (intakeHistory) => {
    set((state) => ({ intakeHistory, ...syncActiveThread(state, { intakeHistory }) }));
    persist(get());
  },

  addConversationMessage: (message) => {
    set((state) => {
      const conversation = [...state.conversation, makeConversationMessage(message)];
      return { conversation, ...syncActiveThread(state, { conversation }) };
    });
    persist(get());
  },

  setLatestWorkoutReview: (review) => {
    set((state) => {
      const latestWorkoutReview = review ? { ...review, createdAt: new Date().toISOString() } : null;
      return { latestWorkoutReview, ...syncActiveThread(state, { latestWorkoutReview }) };
    });
    persist(get());
  },

  resetChatSession: () => {
    const next = { hasEnteredCoachChat: false, failedPrompt: null };
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
      latestWorkoutReview: null,
      activeThreadId: null,
      threads: get().threads,
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
      const savedPlan = normalizePlanTimeline(saved.plan ?? null);
      const savedConversation = Array.isArray(saved.conversation) ? saved.conversation : [];
      const savedThreads: CoachTrainerThread[] = Array.isArray(saved.threads) ? saved.threads : [];
      const shouldMigrateLegacy = savedThreads.length === 0 && (savedPlan || savedConversation.length > 0);
      const migratedId = shouldMigrateLegacy ? makeThreadId() : null;
      const threads = shouldMigrateLegacy
        ? [{
            id: migratedId!,
            title: threadTitle(savedPlan, savedConversation),
            createdAt: savedConversation[0]?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            units: saved.units === "kg" ? "kg" as const : "lbs" as const,
            plan: savedPlan,
            completedExerciseIds: Array.isArray(saved.completedExerciseIds) ? saved.completedExerciseIds : [],
            intakeHistory: Array.isArray(saved.intakeHistory) ? saved.intakeHistory : [],
            conversation: savedConversation,
            latestWorkoutReview: saved.latestWorkoutReview ?? null,
          }]
        : savedThreads;
      set({
        units: saved.units === "kg" ? "kg" : "lbs",
        plan: savedPlan,
        coachAvatar: saved.coachAvatar ?? null,
        hasEnteredCoachChat: saved.hasEnteredCoachChat === true,
        failedPrompt: typeof saved.failedPrompt === "string" ? saved.failedPrompt : null,
        completedExerciseIds: Array.isArray(saved.completedExerciseIds) ? saved.completedExerciseIds : [],
        intakeHistory: Array.isArray(saved.intakeHistory) ? saved.intakeHistory : [],
        conversation: savedConversation,
        latestWorkoutReview: saved.latestWorkoutReview ?? null,
        threads,
        activeThreadId: typeof saved.activeThreadId === "string" ? saved.activeThreadId : migratedId,
        hasLoaded: true,
      });
    } catch {
      set({ hasLoaded: true });
    }
  },
}));

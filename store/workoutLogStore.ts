import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { LoggedSet, WorkoutLogContext } from "@/lib/workoutLog";

const STORAGE_KEY = "spotlift.workoutLog.v1";
const MAX_PRESEEDED_SETS = 6;

interface WorkoutLogState {
  sets: LoggedSet[];
  hasLoaded: boolean;
  load: () => Promise<void>;
  ensureSets: (userId: string, ctx: WorkoutLogContext) => void;
  addSet: (userId: string, ctx: WorkoutLogContext) => void;
  updateSet: (id: string, patch: Partial<Pick<LoggedSet, "reps" | "weight" | "unit" | "completed">>) => void;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function save(sets: LoggedSet[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sets)).catch(() => {});
}

function inSlot(set: LoggedSet, userId: string, ctx: WorkoutLogContext) {
  return set.userId === userId && set.exerciseId === ctx.exerciseId && set.week === ctx.week && set.day === ctx.day;
}

function blankSet(userId: string, ctx: WorkoutLogContext, setNumber: number): LoggedSet {
  return {
    id: newId(),
    userId,
    exerciseId: ctx.exerciseId,
    exerciseName: ctx.exerciseName,
    week: ctx.week,
    day: ctx.day,
    setNumber,
    reps: null,
    weight: null,
    unit: ctx.units,
    completed: false,
    loggedAt: new Date().toISOString(),
  };
}

export const useWorkoutLogStore = create<WorkoutLogState>((set, get) => ({
  sets: [],
  hasLoaded: false,

  load: async () => {
    if (get().hasLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      set({ sets: Array.isArray(parsed) ? parsed : [], hasLoaded: true });
    } catch {
      set({ hasLoaded: true });
    }
  },

  ensureSets: (userId, ctx) => {
    const existing = get().sets.filter((s) => inSlot(s, userId, ctx));
    if (existing.length > 0) return;
    const count = Math.min(Math.max(ctx.prescribedSets, 1), MAX_PRESEEDED_SETS);
    const seeded = Array.from({ length: count }, (_, i) => blankSet(userId, ctx, i + 1));
    const next = [...get().sets, ...seeded];
    set({ sets: next });
    save(next);
  },

  addSet: (userId, ctx) => {
    const existing = get().sets.filter((s) => inSlot(s, userId, ctx));
    const nextNumber = existing.reduce((max, s) => Math.max(max, s.setNumber), 0) + 1;
    const next = [...get().sets, blankSet(userId, ctx, nextNumber)];
    set({ sets: next });
    save(next);
  },

  updateSet: (id, patch) => {
    const next = get().sets.map((s) => (s.id === id ? { ...s, ...patch } : s));
    set({ sets: next });
    save(next);
  },
}));

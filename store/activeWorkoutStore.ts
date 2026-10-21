// The workout someone is in the middle of (app/workout-session.tsx), kept on
// the device so leaving the screen — to log an exercise, check the plan, or
// close the app — never loses their place. Logged sets themselves live in
// workout_set_logs (lib/workoutSetLogs.ts); this only remembers position.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

const STORAGE_KEY = "spotlift_active_workout_v1";

export type ActiveWorkout = {
  threadId: string | null;
  sessionIndex: number;
  // The session's internal label, so a resumed workout is never matched to
  // a different session after the plan changes.
  sessionLabel: string;
  startedAt: string;
  elapsedSeconds: number;
  exerciseIndex: number;
  setIndex: number;
  weight: number;
  reps: number;
  updatedAt: string;
};

interface ActiveWorkoutState {
  active: ActiveWorkout | null;
  hasLoaded: boolean;
  load: () => Promise<void>;
  save: (workout: ActiveWorkout) => void;
  clear: () => void;
}

export const useActiveWorkoutStore = create<ActiveWorkoutState>((set, get) => ({
  active: null,
  hasLoaded: false,

  load: async () => {
    if (get().hasLoaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as ActiveWorkout) : null;
      set({ active: saved && typeof saved.sessionIndex === "number" ? saved : null, hasLoaded: true });
    } catch {
      set({ hasLoaded: true });
    }
  },

  save: (workout) => {
    const next = { ...workout, updatedAt: new Date().toISOString() };
    set({ active: next });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
  },

  clear: () => {
    set({ active: null });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  },
}));

// Whether a saved workout belongs to this plan session.
export function isActiveFor(
  active: ActiveWorkout | null,
  threadId: string | null,
  sessionIndex: number,
  sessionLabel: string | undefined
): boolean {
  return !!active && active.threadId === threadId && active.sessionIndex === sessionIndex && active.sessionLabel === sessionLabel;
}

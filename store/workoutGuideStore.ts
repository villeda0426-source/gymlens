import { create } from "zustand";
import type { WorkoutLogContext } from "@/lib/workoutLog";

export interface WorkoutGuide {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
  // Present only for strength exercises opened from the plan; enables the Workout Log.
  logContext?: WorkoutLogContext;
}

interface WorkoutGuideStore {
  currentGuide: WorkoutGuide | null;
  setCurrentGuide: (guide: WorkoutGuide | null) => void;
}

export const useWorkoutGuideStore = create<WorkoutGuideStore>((set) => ({
  currentGuide: null,
  setCurrentGuide: (guide) => set({ currentGuide: guide }),
}));

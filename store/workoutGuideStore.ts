import { create } from "zustand";

export interface WorkoutGuide {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
}

interface WorkoutGuideStore {
  currentGuide: WorkoutGuide | null;
  setCurrentGuide: (guide: WorkoutGuide | null) => void;
}

export const useWorkoutGuideStore = create<WorkoutGuideStore>((set) => ({
  currentGuide: null,
  setCurrentGuide: (guide) => set({ currentGuide: guide }),
}));

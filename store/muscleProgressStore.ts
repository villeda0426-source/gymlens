import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import {
  AVATAR_MUSCLE_GROUPS,
  AvatarMuscleGroup,
  MuscleProgressMap,
  generateClientLogId,
  normalizeMusclesToAvatarGroups,
} from "@/lib/muscleProgress";
import { lookupSecondaryMuscles } from "@/lib/exerciseSecondaryMuscles";

export interface MuscleDelta {
  muscle_group: AvatarMuscleGroup;
  base_delta: number;
  bonus_delta: number;
  total_delta: number;
  new_score: number;
  new_level: number;
  leveled_up: boolean;
}

export interface CompletedExerciseRow {
  id: string;
  exercise_slug: string;
  exercise_name: string;
  primary_muscles: AvatarMuscleGroup[];
  secondary_muscles: AvatarMuscleGroup[];
  completed_at: string;
}

function emptyProgress(): MuscleProgressMap {
  const map = {} as MuscleProgressMap;
  for (const group of AVATAR_MUSCLE_GROUPS) {
    map[group] = { score: 0, level: 0 };
  }
  return map;
}

interface MuscleProgressState {
  progress: MuscleProgressMap;
  isLoading: boolean;
  loadProgress: (userId: string | null) => Promise<void>;
  completeExercise: (
    userId: string,
    exercise: { slug: string; name: string; rawPrimaryMuscles: string[] }
  ) => Promise<MuscleDelta[]>;
  recentCompletionsFor: (
    userId: string,
    group: AvatarMuscleGroup,
    limit?: number
  ) => Promise<{ rows: CompletedExerciseRow[]; total: number }>;
}

export const useMuscleProgressStore = create<MuscleProgressState>((set, get) => ({
  progress: emptyProgress(),
  isLoading: false,

  loadProgress: async (userId) => {
    if (!userId) {
      set({ progress: emptyProgress() });
      return;
    }

    set({ isLoading: true });
    try {
      const { data, error } = await supabase
        .from("muscle_progress")
        .select("muscle_group, score, level")
        .eq("user_id", userId);

      const next = emptyProgress();
      if (!error && data) {
        for (const row of data as { muscle_group: AvatarMuscleGroup; score: number; level: number }[]) {
          if (row.muscle_group in next) {
            next[row.muscle_group] = { score: row.score, level: row.level };
          }
        }
      }
      set({ progress: next });
    } finally {
      set({ isLoading: false });
    }
  },

  completeExercise: async (userId, exercise) => {
    const primaryGroups = normalizeMusclesToAvatarGroups(exercise.rawPrimaryMuscles);
    const secondaryGroups = lookupSecondaryMuscles(exercise.name);
    const clientLogId = generateClientLogId();

    const { data, error } = await supabase.rpc("complete_exercise", {
      p_exercise_slug: exercise.slug,
      p_exercise_name: exercise.name,
      p_primary_muscles: primaryGroups,
      p_secondary_muscles: secondaryGroups,
      p_client_log_id: clientLogId,
    });

    if (error || !data) {
      console.error("[muscleProgressStore] completeExercise error:", error?.message);
      return [];
    }

    const deltas = data as MuscleDelta[];
    if (deltas.length > 0) {
      set((state) => {
        const next = { ...state.progress };
        for (const delta of deltas) {
          next[delta.muscle_group] = { score: delta.new_score, level: delta.new_level };
        }
        return { progress: next };
      });
    }

    return deltas;
  },

  recentCompletionsFor: async (userId, group, limit = 5) => {
    const { data, error, count } = await supabase
      .from("completed_exercises")
      .select("id, exercise_slug, exercise_name, primary_muscles, secondary_muscles, completed_at", {
        count: "exact",
      })
      .eq("user_id", userId)
      .or(`primary_muscles.cs.{${group}},secondary_muscles.cs.{${group}}`)
      .order("completed_at", { ascending: false })
      .limit(limit);

    if (error || !data) return { rows: [], total: 0 };
    return { rows: data as CompletedExerciseRow[], total: count ?? data.length };
  },
}));

// Exposed for screens that just need the static shape without subscribing.
export { emptyProgress };

import { AvatarMuscleGroup } from "./muscleProgress";

// Best-effort secondary-muscle lookup for AI Trainer exercises. The Trainer's
// generated Exercise type only has `primary_muscles` — this fills in the
// secondary muscles for common compound lifts so completions score the same
// way the equipment/workout-search features already describe them (e.g. bench
// press also working triceps/shoulders). A miss just means no secondary
// muscles are credited — never a crash.
const SECONDARY_MUSCLES: Record<string, AvatarMuscleGroup[]> = {
  bench_press: ["triceps", "shoulders"],
  incline_bench_press: ["triceps", "shoulders"],
  decline_bench_press: ["triceps", "shoulders"],
  dumbbell_bench_press: ["triceps", "shoulders"],
  push_up: ["triceps", "shoulders", "core"],
  push_ups: ["triceps", "shoulders", "core"],
  chest_fly: ["shoulders"],
  dumbbell_fly: ["shoulders"],

  squat: ["glutes", "hamstrings", "core"],
  squats: ["glutes", "hamstrings", "core"],
  barbell_squat: ["glutes", "hamstrings", "core"],
  back_squat: ["glutes", "hamstrings", "core"],
  front_squat: ["glutes", "hamstrings", "core"],
  leg_press: ["glutes", "hamstrings"],
  lunge: ["glutes", "hamstrings"],
  lunges: ["glutes", "hamstrings"],

  pull_up: ["back", "biceps"],
  pull_ups: ["back", "biceps"],
  chin_up: ["back", "biceps"],
  chin_ups: ["back", "biceps"],
  lat_pulldown: ["back", "biceps"],
  row: ["back", "biceps"],
  rows: ["back", "biceps"],
  barbell_row: ["back", "biceps"],
  dumbbell_row: ["back", "biceps"],
  seated_row: ["back", "biceps"],

  shoulder_press: ["triceps"],
  overhead_press: ["triceps", "core"],
  military_press: ["triceps", "core"],
  dumbbell_shoulder_press: ["triceps"],
  lateral_raise: [],
  lateral_raises: [],

  deadlift: ["hamstrings", "glutes", "back", "core"],
  romanian_deadlift: ["hamstrings", "glutes", "back"],
  sumo_deadlift: ["hamstrings", "glutes", "back", "core"],

  bicep_curl: [],
  bicep_curls: [],
  hammer_curl: [],
  tricep_dip: ["chest", "shoulders"],
  tricep_dips: ["chest", "shoulders"],
  tricep_pushdown: [],

  plank: ["shoulders"],
  crunch: [],
  crunches: [],
  sit_up: [],
  sit_ups: [],

  calf_raise: [],
  calf_raises: [],
  hip_thrust: ["hamstrings"],
  hip_thrusts: ["hamstrings"],
  glute_bridge: ["hamstrings"],
};

function normalizeExerciseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function lookupSecondaryMuscles(exerciseName: string): AvatarMuscleGroup[] {
  return SECONDARY_MUSCLES[normalizeExerciseName(exerciseName)] ?? [];
}

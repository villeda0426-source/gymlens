// Canonical 10-group taxonomy for the Dynamic Muscle Avatar. Must stay in sync
// with the `muscle_group` check constraint in supabase/schema.sql.
export const AVATAR_MUSCLE_GROUPS = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
] as const;

export type AvatarMuscleGroup = (typeof AVATAR_MUSCLE_GROUPS)[number];

export const MUSCLE_GROUP_LABELS: Record<AvatarMuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  core: "Core/Abs",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

export const FRONT_VIEW_GROUPS: AvatarMuscleGroup[] = [
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "quads",
  "calves",
];

export const BACK_VIEW_GROUPS: AvatarMuscleGroup[] = [
  "back",
  "shoulders",
  "triceps",
  "glutes",
  "hamstrings",
  "calves",
];

// Maps each of the 10 canonical groups onto MuscleMapView's existing granular
// body-region path keys, reused for rendering AvatarBody's fill.
export const AVATAR_TO_BODY_REGIONS: Record<AvatarMuscleGroup, string[]> = {
  chest: ["chest"],
  back: ["upper_back", "lats", "lower_back", "traps"],
  shoulders: ["front_deltoid", "side_deltoid", "rear_deltoid"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  core: ["abs", "obliques"],
  glutes: ["glutes"],
  quads: ["quadriceps"],
  hamstrings: ["hamstrings"],
  calves: ["calves"],
};

const MUSCLE_GROUP_ALIASES: Record<string, AvatarMuscleGroup> = {
  chest: "chest",
  pectorals: "chest",
  pectoral: "chest",
  pecs: "chest",
  pec: "chest",

  back: "back",
  lats: "back",
  lat: "back",
  latissimus_dorsi: "back",
  upper_back: "back",
  lower_back: "back",
  traps: "back",
  trap: "back",
  trapezius: "back",
  rhomboids: "back",
  rhomboid: "back",
  erector_spinae: "back",

  shoulders: "shoulders",
  shoulder: "shoulders",
  deltoids: "shoulders",
  deltoid: "shoulders",
  front_deltoid: "shoulders",
  front_deltoids: "shoulders",
  side_deltoid: "shoulders",
  side_deltoids: "shoulders",
  rear_deltoid: "shoulders",
  rear_deltoids: "shoulders",
  anterior_deltoid: "shoulders",
  anterior_deltoids: "shoulders",
  posterior_deltoid: "shoulders",
  posterior_deltoids: "shoulders",
  lateral_deltoid: "shoulders",
  lateral_deltoids: "shoulders",

  biceps: "biceps",
  bicep: "biceps",
  biceps_brachii: "biceps",

  triceps: "triceps",
  tricep: "triceps",
  triceps_brachii: "triceps",

  core: "core",
  abs: "core",
  ab: "core",
  abdominals: "core",
  abdominal: "core",
  rectus_abdominis: "core",
  obliques: "core",
  oblique: "core",

  glutes: "glutes",
  glute: "glutes",
  gluteus_maximus: "glutes",

  quads: "quads",
  quad: "quads",
  quadriceps: "quads",

  hamstrings: "hamstrings",
  hamstring: "hamstrings",

  calves: "calves",
  calf: "calves",
  gastrocnemius: "calves",
  soleus: "calves",
};

// Lowercases, strips parenthetical asides (e.g. "Latissimus Dorsi (Lats)"), and
// collapses punctuation/whitespace into underscores, same technique as
// MuscleMapView's normalizeMuscleKey but targeting the 10-group taxonomy.
function normalizeMuscleText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Converts loose AI-generated muscle text into one of the 10 canonical groups.
// Returns null on no match instead of throwing — unmatched muscles are dropped,
// never crash the completion flow.
export function normalizeToAvatarGroup(raw: string): AvatarMuscleGroup | null {
  const key = normalizeMuscleText(raw);
  return MUSCLE_GROUP_ALIASES[key] ?? null;
}

export function normalizeMusclesToAvatarGroups(raw: string[]): AvatarMuscleGroup[] {
  const out = new Set<AvatarMuscleGroup>();
  for (const m of raw) {
    const group = normalizeToAvatarGroup(m);
    if (group) out.add(group);
  }
  return Array.from(out);
}

// Mirrors muscle_level_for_score() in supabase/schema.sql — keep both in sync.
export function levelForScore(score: number): number {
  if (score >= 500) return 5;
  if (score >= 300) return 4;
  if (score >= 150) return 3;
  if (score >= 50) return 2;
  if (score >= 1) return 1;
  return 0;
}

const LEVEL_THRESHOLDS = [0, 1, 50, 150, 300, 500];

// Score required to reach the next level, or null if already at the max (L5).
export function nextLevelThreshold(score: number): number | null {
  const level = levelForScore(score);
  return level >= 5 ? null : LEVEL_THRESHOLDS[level + 1];
}

// RFC4122-v4-ish id, good enough for idempotency (collision-avoidance), not
// cryptographic use. No new dependency needed for this.
export function generateClientLogId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const SUGGESTED_EXERCISES: Record<AvatarMuscleGroup, string> = {
  chest: "push-ups or bench press",
  back: "rows or pull-ups",
  shoulders: "overhead press or lateral raises",
  biceps: "bicep curls or chin-ups",
  triceps: "tricep dips or pushdowns",
  core: "planks or cable crunches",
  glutes: "hip thrusts or glute bridges",
  quads: "squats or leg press",
  hamstrings: "Romanian deadlifts or leg curls",
  calves: "calf raises",
};

export type MuscleProgressMap = Record<AvatarMuscleGroup, { score: number; level: number }>;

export interface UndertrainedRecommendation {
  muscleGroup: AvatarMuscleGroup;
  comparisonGroup: AvatarMuscleGroup;
  suggestionGroup: AvatarMuscleGroup;
  message: string;
}

// Recommends the lowest-scored muscle group, but only if it's meaningfully
// behind the rest of the user's training (strictly below the median level) —
// avoids nagging an evenly-trained-but-low-volume user.
export function getUndertrainedRecommendation(
  progress: MuscleProgressMap
): UndertrainedRecommendation | null {
  const entries = AVATAR_MUSCLE_GROUPS.map((group) => ({
    group,
    score: progress[group]?.score ?? 0,
    level: progress[group]?.level ?? 0,
  }));

  const sortedByScore = [...entries].sort((a, b) => a.score - b.score);
  const under = sortedByScore[0];
  const over = sortedByScore[sortedByScore.length - 1];

  const sortedLevels = entries.map((e) => e.level).sort((a, b) => a - b);
  const medianLevel = sortedLevels[Math.floor((sortedLevels.length - 1) / 2)];

  if (!under || under.level >= medianLevel || under.group === over.group) {
    return null;
  }

  const overLabel = MUSCLE_GROUP_LABELS[over.group];
  const underLabel = MUSCLE_GROUP_LABELS[under.group];
  const message =
    `Your ${underLabel} has been trained less than your ${overLabel} this month. ` +
    `Consider adding ${SUGGESTED_EXERCISES[under.group]} to keep your training balanced.`;

  return {
    muscleGroup: under.group,
    comparisonGroup: over.group,
    suggestionGroup: under.group,
    message,
  };
}

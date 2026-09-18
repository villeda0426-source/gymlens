export type ReliableUnits = "kg" | "lbs";

export type ReliableExercise = {
  exercise_id: string;
  name: string;
  category: "compound" | "accessory" | "warmup" | "mobility" | "cardio";
  primary_muscles: string[];
  sets: number;
  rep_range: { min: number; max: number };
  target_rpe: number | null;
  target_load: string;
  rest_seconds: number;
  tempo: string | null;
  progression_rule: string;
  substitutions: string[];
  coach_notes: string;
};

export type ReliablePlan = {
  goal: string;
  goal_type: "strength" | "hypertrophy" | "fat_loss" | "endurance" | "general_fitness" | "sport_specific";
  experience_level: "beginner" | "intermediate" | "advanced";
  units: ReliableUnits;
  timeline_weeks: number;
  days_per_week: number;
  split: string;
  equipment: string[];
  constraints: string[];
  progression_strategy: string;
  sessions: Array<{
    day_label: string;
    focus: string;
    estimated_minutes: number;
    exercises: ReliableExercise[];
  }>;
  weekly_notes: string;
  safety_flags: string[];
};

export type ReliablePlanResponse = {
  status: "plan_ready";
  summary: string;
  plan: ReliablePlan;
};

const PLANNING_SIGNAL = /\b(plan|program|workout|train|training|strength|stronger|muscle|hypertrophy|weight loss|lose weight|fat loss|fitness|lift|lifting)\b/i;
const DETAIL_SIGNAL = /\b(\d\s*(day|days)|gym|home|bodyweight|dumbbell|barbell|machine|beginner|intermediate|advanced|injur|pain|limit|equipment)\b/i;
const MEDICAL_RED_FLAG = /\b(chest pain|faint(?:ed|ing)?|dizz(?:y|iness)|recent surgery|pregnan(?:t|cy)|uncontrolled (?:heart|cardiac|blood pressure|diabetes))\b/i;

export function canBuildReliablePlan(text: string): boolean {
  return PLANNING_SIGNAL.test(text) && DETAIL_SIGNAL.test(text) && !MEDICAL_RED_FLAG.test(text);
}

export function hasCoachMedicalRedFlag(text: string): boolean {
  return MEDICAL_RED_FLAG.test(text);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function inferDays(text: string): number {
  const digit = text.match(/\b([1-6])\s*(?:day|days|x)\b/i);
  const wordDays: Array<[RegExp, number]> = [
    [/\b(?:one|once)\b/i, 1],
    [/\b(?:two|twice)\b/i, 2],
    [/\bthree\b/i, 3],
    [/\bfour\b/i, 4],
  ];
  const inferred = digit ? Number(digit[1]) : wordDays.find(([pattern]) => pattern.test(text))?.[1] ?? 3;
  return Math.max(1, Math.min(4, inferred));
}

function inferGoal(text: string): Pick<ReliablePlan, "goal" | "goal_type"> {
  if (/\b(strength|stronger|powerlift|one rep|max(?:imum)?)\b/i.test(text)) {
    return { goal: "Build strength", goal_type: "strength" };
  }
  if (/\b(muscle|hypertrophy|size|bulk)\b/i.test(text)) {
    return { goal: "Build muscle", goal_type: "hypertrophy" };
  }
  if (/\b(fat loss|weight loss|lose weight|lean out)\b/i.test(text)) {
    return { goal: "Improve fitness while supporting fat loss", goal_type: "fat_loss" };
  }
  if (/\b(run|running|endurance|cardio|conditioning)\b/i.test(text)) {
    return { goal: "Improve strength and endurance", goal_type: "endurance" };
  }
  return { goal: "Build consistent full-body fitness", goal_type: "general_fitness" };
}

function inferExperience(text: string): ReliablePlan["experience_level"] {
  if (/\b(advanced|experienced|competitive)\b/i.test(text)) return "advanced";
  if (/\b(intermediate|some experience|returning)\b/i.test(text)) return "intermediate";
  return "beginner";
}

type EquipmentProfile = "bodyweight" | "dumbbell" | "gym";

function inferEquipment(text: string): { profile: EquipmentProfile; labels: string[] } {
  if (/\b(bodyweight|no equipment|without equipment)\b/i.test(text)) {
    return { profile: "bodyweight", labels: ["Bodyweight", "Floor space"] };
  }
  if (/\b(home|dumbbell|dumbbells)\b/i.test(text) && !/\bfull gym\b/i.test(text)) {
    return { profile: "dumbbell", labels: ["Dumbbells", "Bench or stable surface"] };
  }
  return { profile: "gym", labels: ["Full gym"] };
}

function exercise(
  name: string,
  category: ReliableExercise["category"],
  muscles: string[],
  sets: number,
  reps: [number, number],
  rest: number,
  notes: string,
  substitutions: string[],
  units: ReliableUnits,
  lowerBody = false
): ReliableExercise {
  const increment = units === "kg" ? (lowerBody ? "2.5-5 kg" : "1-2.5 kg") : (lowerBody ? "5-10 lb" : "2.5-5 lb");
  return {
    exercise_id: slugify(name),
    name,
    category,
    primary_muscles: muscles,
    sets,
    rep_range: { min: reps[0], max: reps[1] },
    target_rpe: 7,
    target_load: "Choose a controlled load that leaves about 2-3 good reps in reserve.",
    rest_seconds: rest,
    tempo: null,
    progression_rule: `When every set reaches the top of the rep range with clean form and 2+ reps in reserve, add ${increment} next time.`,
    substitutions,
    coach_notes: notes,
  };
}

function templates(profile: EquipmentProfile, units: ReliableUnits, strength: boolean) {
  const compoundReps: [number, number] = strength ? [5, 8] : [8, 12];
  const accessoryReps: [number, number] = strength ? [8, 12] : [10, 15];

  if (profile === "bodyweight") {
    return {
      squat: exercise("Bodyweight Squat", "compound", ["quads", "glutes"], 3, compoundReps, 75, "Use a pain-free depth and keep your whole foot planted.", ["Chair Squat", "Supported Split Squat"], units, true),
      hinge: exercise("Glute Bridge", "compound", ["glutes", "hamstrings"], 3, compoundReps, 75, "Finish by squeezing the glutes without arching the lower back.", ["Hip Hinge", "Single-Leg Glute Bridge"], units, true),
      push: exercise("Incline Push-Up", "compound", ["chest", "triceps", "shoulders"], 3, compoundReps, 75, "Keep a straight line from shoulders to heels.", ["Wall Push-Up", "Knee Push-Up"], units),
      pull: exercise("Towel Isometric Row", "compound", ["back", "biceps"], 3, [20, 30], 60, "Pull against the towel with a tall chest and no neck strain.", ["Prone W Raise", "Reverse Snow Angel"], units),
      core: exercise("Dead Bug", "accessory", ["core"], 2, accessoryReps, 45, "Keep the lower back gently pressed into the floor.", ["Bird Dog", "Front Plank"], units),
      carry: exercise("Bear Plank Shoulder Tap", "accessory", ["core", "shoulders"], 2, accessoryReps, 45, "Move slowly and keep the hips level.", ["Front Plank", "Side Plank"], units),
    };
  }

  if (profile === "dumbbell") {
    return {
      squat: exercise("Goblet Squat", "compound", ["quads", "glutes"], 3, compoundReps, 90, "Brace first and use a comfortable, repeatable depth.", ["Dumbbell Split Squat", "Chair Squat"], units, true),
      hinge: exercise("Dumbbell Romanian Deadlift", "compound", ["hamstrings", "glutes"], 3, compoundReps, 90, "Push the hips back and keep the dumbbells close.", ["Dumbbell Hip Thrust", "Glute Bridge"], units, true),
      push: exercise("Dumbbell Floor Press", "compound", ["chest", "triceps"], 3, compoundReps, 90, "Keep the wrists stacked and lower with control.", ["Incline Push-Up", "Dumbbell Bench Press"], units),
      pull: exercise("One-Arm Dumbbell Row", "compound", ["back", "biceps"], 3, compoundReps, 90, "Keep the torso stable and row toward the hip.", ["Chest-Supported Dumbbell Row", "Dumbbell Pullover"], units),
      core: exercise("Dead Bug", "accessory", ["core"], 2, accessoryReps, 45, "Keep the lower back gently pressed into the floor.", ["Bird Dog", "Front Plank"], units),
      carry: exercise("Dumbbell Suitcase Carry", "accessory", ["core", "grip"], 2, [30, 45], 45, "Walk tall without leaning toward the weight.", ["Farmer Carry", "Side Plank"], units),
    };
  }

  return {
    squat: exercise("Leg Press", "compound", ["quads", "glutes"], 3, compoundReps, 90, "Keep the hips and lower back against the pad.", ["Goblet Squat", "Hack Squat"], units, true),
    hinge: exercise("Dumbbell Romanian Deadlift", "compound", ["hamstrings", "glutes"], 3, compoundReps, 90, "Push the hips back and keep the weights close.", ["Hip Thrust", "Seated Leg Curl"], units, true),
    push: exercise("Machine Chest Press", "compound", ["chest", "triceps"], 3, compoundReps, 90, "Set the seat so the handles align around mid-chest.", ["Dumbbell Bench Press", "Incline Push-Up"], units),
    pull: exercise("Lat Pulldown", "compound", ["back", "biceps"], 3, compoundReps, 90, "Pull the elbows down without leaning far back.", ["Seated Cable Row", "Assisted Pull-Up"], units),
    core: exercise("Cable Pallof Press", "accessory", ["core"], 2, accessoryReps, 45, "Resist rotation and keep the ribs stacked over the pelvis.", ["Dead Bug", "Front Plank"], units),
    carry: exercise("Farmer Carry", "accessory", ["core", "grip"], 2, [30, 45], 45, "Walk tall with controlled steps.", ["Suitcase Carry", "Cable Pallof Press"], units),
  };
}

export function buildReliableStarterPlan(text: string, units: ReliableUnits): ReliablePlanResponse | null {
  if (!canBuildReliablePlan(text)) return null;

  const days = inferDays(text);
  const goal = inferGoal(text);
  const experience = inferExperience(text);
  const equipment = inferEquipment(text);
  const strength = goal.goal_type === "strength";
  const moves = templates(equipment.profile, units, strength);
  const hasPain = /\b(injur|pain|hurt|limitation)\b/i.test(text);
  const constraints = hasPain
    ? ["User reported pain or a limitation; skip any movement that reproduces symptoms and seek qualified guidance if it persists."]
    : [];
  const safetyFlags = hasPain
    ? ["Do not train through sharp, worsening, or unstable pain."]
    : [];
  const sessionTemplates = [
    { focus: "Full Body A", exercises: [moves.squat, moves.push, moves.pull, moves.core] },
    { focus: "Full Body B", exercises: [moves.hinge, moves.pull, moves.push, moves.carry] },
    { focus: "Full Body A", exercises: [moves.squat, moves.push, moves.pull, moves.core] },
    { focus: "Full Body B", exercises: [moves.hinge, moves.pull, moves.push, moves.carry] },
  ];
  const selected = days === 1 ? sessionTemplates.slice(0, 1) : sessionTemplates.slice(0, days);
  const sessions = selected.map((session, index) => ({
    day_label: `Week 1 Day ${index + 1} - ${session.focus}`,
    focus: session.focus,
    estimated_minutes: 40,
    exercises: session.exercises,
  }));
  const assumptions = [
    `${days} training day${days === 1 ? "" : "s"} per week`,
    equipment.labels.join(" and "),
    `${experience} experience`,
  ];

  return {
    status: "plan_ready",
    summary: `I prepared a reliable starter plan for ${goal.goal.toLowerCase()}. I assumed ${assumptions.join(", ")}. You can use this plan immediately even if Coach's extra personalization is unavailable, and you can change any assumption in chat.`,
    plan: {
      ...goal,
      experience_level: experience,
      units,
      timeline_weeks: 3,
      days_per_week: days,
      split: days <= 3 ? "Full Body" : "Alternating Full Body A / B",
      equipment: equipment.labels,
      constraints,
      progression_strategy: "Repeat the weekly structure for three weeks. Add reps before load, and only increase load after every set is completed with clean form and at least two reps in reserve.",
      sessions,
      weekly_notes: "Leave at least one recovery day between harder full-body sessions when possible. If readiness is poor, keep the same exercises but remove one set from each movement.",
      safety_flags: safetyFlags,
    },
  };
}

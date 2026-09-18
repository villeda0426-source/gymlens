export type ReliableUnits = "kg" | "lbs";
export type ReliableLanguage = "en" | "es";

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

const PLANNING_SIGNAL =
  /\b(plan|program|workout|train|training|strength|stronger|muscle|hypertrophy|weight loss|lose weight|fat loss|fitness|lift|lifting|programa|entrenar|entrenamiento|entrenamientos|fuerza|m[uú]sculo|m[uú]sculos|musculatura|hipertrofia|adelgazar|perder peso|bajar de peso|grasa|acondicionamiento|levantar|gimnasio|ejercicio|ejercicios)\b/i;
const DETAIL_SIGNAL =
  /\b(\d\s*(day|days|d[ií]a|d[ií]as|veces)|gym|home|bodyweight|dumbbell|barbell|machine|beginner|intermediate|advanced|injur|pain|limit|equipment|gimnasio|casa|peso corporal|sin equipo|mancuerna|mancuernas|barra|m[aá]quina|m[aá]quinas|principiante|intermedio|avanzad[oa]|lesi[oó]n|lesiones|dolor|limitaci[oó]n|equipo)\b/i;
const MEDICAL_RED_FLAG =
  /\b(chest pain|faint(?:ed|ing)?|dizz(?:y|iness)|recent surgery|pregnan(?:t|cy)|uncontrolled (?:heart|cardiac|blood pressure|diabetes)|dolor (?:en el|de) pecho|dolor tor[aá]cico|desmay(?:o|os|ar|arme|é)|mareo|mareos|mare(?:ado|ada)|cirug[ií]a reciente|operaci[oó]n reciente|embaraz(?:o|ada)|(?:presi[oó]n|diabetes|coraz[oó]n|problema card[ií]aco)[^.]{0,20}(?:descontrolad[oa]|sin control|no controlad[oa]))\b/i;

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
  const digit = text.match(/\b([1-6])\s*(?:day|days|x|d[ií]a|d[ií]as|veces)\b/i);
  const wordDays: Array<[RegExp, number]> = [
    [/\b(?:one|once|un|una|un d[ií]a)\b/i, 1],
    [/\b(?:two|twice|dos)\b/i, 2],
    [/\b(?:three|tres)\b/i, 3],
    [/\b(?:four|cuatro)\b/i, 4],
  ];
  const inferred = digit ? Number(digit[1]) : wordDays.find(([pattern]) => pattern.test(text))?.[1] ?? 3;
  return Math.max(1, Math.min(4, inferred));
}

function inferGoal(text: string): Pick<ReliablePlan, "goal" | "goal_type"> {
  if (/\b(strength|stronger|powerlift|one rep|max(?:imum)?|fuerza|m[aá]s fuerte|powerlifting)\b/i.test(text)) {
    return { goal: "Build strength", goal_type: "strength" };
  }
  if (/\b(muscle|hypertrophy|size|bulk|m[uú]sculo|m[uú]sculos|musculatura|hipertrofia|masa|volumen)\b/i.test(text)) {
    return { goal: "Build muscle", goal_type: "hypertrophy" };
  }
  if (/\b(fat loss|weight loss|lose weight|lean out|perder peso|bajar de peso|adelgazar|perder grasa|definici[oó]n)\b/i.test(text)) {
    return { goal: "Improve fitness while supporting fat loss", goal_type: "fat_loss" };
  }
  if (/\b(run|running|endurance|cardio|conditioning|correr|resistencia|acondicionamiento)\b/i.test(text)) {
    return { goal: "Improve strength and endurance", goal_type: "endurance" };
  }
  return { goal: "Build consistent full-body fitness", goal_type: "general_fitness" };
}

function inferExperience(text: string): ReliablePlan["experience_level"] {
  if (/\b(advanced|experienced|competitive|avanzad[oa]|experiment[oa]d[oa]|competitiv[oa])\b/i.test(text)) return "advanced";
  if (/\b(intermediate|some experience|returning|intermedi[oa]|algo de experiencia|volviendo|retomando)\b/i.test(text)) return "intermediate";
  return "beginner";
}

type EquipmentProfile = "bodyweight" | "dumbbell" | "gym";

function inferEquipment(text: string): { profile: EquipmentProfile; labels: string[] } {
  if (/\b(bodyweight|no equipment|without equipment|peso corporal|sin equipo|sin equipamiento)\b/i.test(text)) {
    return { profile: "bodyweight", labels: ["Bodyweight", "Floor space"] };
  }
  if (/\b(home|dumbbell|dumbbells|casa|mancuerna|mancuernas)\b/i.test(text) && !/\b(full gym|gimnasio completo)\b/i.test(text)) {
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

export function buildReliableStarterPlan(
  text: string,
  units: ReliableUnits,
  language: ReliableLanguage = "en"
): ReliablePlanResponse | null {
  if (!canBuildReliablePlan(text)) return null;

  const days = inferDays(text);
  const goal = inferGoal(text);
  const experience = inferExperience(text);
  const equipment = inferEquipment(text);
  const strength = goal.goal_type === "strength";
  const moves = templates(equipment.profile, units, strength);
  const hasPain = /\b(injur|pain|hurt|limitation|lesi[oó]n|lesiones|dolor|duele|molestia|limitaci[oó]n)\b/i.test(text);
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
    estimated_minutes: estimateSessionMinutes(session.exercises),
    exercises: session.exercises,
  }));
  const assumptions = [
    `${days} training day${days === 1 ? "" : "s"} per week`,
    equipment.labels.join(" and "),
    `${experience} experience`,
  ];

  const response: ReliablePlanResponse = {
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

  return language === "es" ? translatePlanResponse(response) : response;
}

/* Spanish copy for the deterministic plan. Kept beside the templates so the
   starter plan never mixes languages when Coach personalization is offline. */

const ES_NAMES: Record<string, string> = {
  "Bodyweight Squat": "Sentadilla con peso corporal",
  "Glute Bridge": "Puente de glúteos",
  "Incline Push-Up": "Flexión inclinada",
  "Towel Isometric Row": "Remo isométrico con toalla",
  "Dead Bug": "Bicho muerto",
  "Bear Plank Shoulder Tap": "Plancha de oso con toque de hombro",
  "Goblet Squat": "Sentadilla goblet",
  "Dumbbell Romanian Deadlift": "Peso muerto rumano con mancuernas",
  "Dumbbell Floor Press": "Press de piso con mancuernas",
  "One-Arm Dumbbell Row": "Remo a una mano con mancuerna",
  "Dumbbell Suitcase Carry": "Caminata maleta con mancuerna",
  "Leg Press": "Prensa de piernas",
  "Machine Chest Press": "Press de pecho en máquina",
  "Lat Pulldown": "Jalón al pecho",
  "Cable Pallof Press": "Press Pallof en polea",
  "Farmer Carry": "Caminata del granjero",
  "Chair Squat": "Sentadilla a la silla",
  "Supported Split Squat": "Sentadilla búlgara asistida",
  "Hip Hinge": "Bisagra de cadera",
  "Single-Leg Glute Bridge": "Puente de glúteos a una pierna",
  "Wall Push-Up": "Flexión en pared",
  "Knee Push-Up": "Flexión de rodillas",
  "Prone W Raise": "Elevación en W boca abajo",
  "Reverse Snow Angel": "Ángel invertido",
  "Bird Dog": "Perro de caza",
  "Front Plank": "Plancha frontal",
  "Side Plank": "Plancha lateral",
  "Dumbbell Split Squat": "Sentadilla búlgara con mancuernas",
  "Dumbbell Hip Thrust": "Empuje de cadera con mancuerna",
  "Dumbbell Bench Press": "Press de banca con mancuernas",
  "Chest-Supported Dumbbell Row": "Remo con apoyo de pecho",
  "Dumbbell Pullover": "Pullover con mancuerna",
  "Hack Squat": "Sentadilla hack",
  "Hip Thrust": "Empuje de cadera",
  "Seated Leg Curl": "Curl femoral sentado",
  "Seated Cable Row": "Remo sentado en polea",
  "Assisted Pull-Up": "Dominada asistida",
  "Suitcase Carry": "Caminata maleta",
};

const ES_NOTES: Record<string, string> = {
  "Bodyweight Squat": "Usa una profundidad sin dolor y mantén todo el pie apoyado.",
  "Glute Bridge": "Termina apretando los glúteos sin arquear la espalda baja.",
  "Incline Push-Up": "Mantén una línea recta desde los hombros hasta los talones.",
  "Towel Isometric Row": "Jala contra la toalla con el pecho alto y sin tensar el cuello.",
  "Dead Bug": "Mantén la espalda baja apoyada suavemente contra el piso.",
  "Bear Plank Shoulder Tap": "Muévete despacio y mantén las caderas niveladas.",
  "Goblet Squat": "Activa el core primero y usa una profundidad cómoda y repetible.",
  "Dumbbell Romanian Deadlift": "Lleva las caderas atrás y mantén las mancuernas cerca.",
  "Dumbbell Floor Press": "Mantén las muñecas alineadas y baja con control.",
  "One-Arm Dumbbell Row": "Mantén el torso estable y rema hacia la cadera.",
  "Dumbbell Suitcase Carry": "Camina erguido sin inclinarte hacia el peso.",
  "Leg Press": "Mantén las caderas y la espalda baja apoyadas en el respaldo.",
  "Machine Chest Press": "Ajusta el asiento para que las agarraderas queden a media altura del pecho.",
  "Lat Pulldown": "Baja los codos sin inclinarte demasiado hacia atrás.",
  "Cable Pallof Press": "Resiste la rotación y mantén las costillas sobre la pelvis.",
  "Farmer Carry": "Camina erguido con pasos controlados.",
};

const ES_GOALS: Record<string, string> = {
  "Build strength": "Ganar fuerza",
  "Build muscle": "Ganar músculo",
  "Improve fitness while supporting fat loss": "Mejorar la condición física y apoyar la pérdida de grasa",
  "Improve strength and endurance": "Mejorar la fuerza y la resistencia",
  "Build consistent full-body fitness": "Construir una condición física constante de cuerpo completo",
};

const ES_EQUIPMENT: Record<string, string> = {
  Bodyweight: "Peso corporal",
  "Floor space": "Espacio en el piso",
  Dumbbells: "Mancuernas",
  "Bench or stable surface": "Banco o superficie estable",
  "Full gym": "Gimnasio completo",
};

const ES_FOCUS: Record<string, string> = {
  "Full Body A": "Cuerpo Completo A",
  "Full Body B": "Cuerpo Completo B",
};

const ES_EXPERIENCE: Record<ReliablePlan["experience_level"], string> = {
  beginner: "principiante",
  intermediate: "intermedia",
  advanced: "avanzada",
};

function esName(name: string): string {
  return ES_NAMES[name] ?? name;
}

function translatePlanResponse(response: ReliablePlanResponse): ReliablePlanResponse {
  const plan = response.plan;
  const increments = plan.units === "kg" ? { lower: "2.5-5 kg", upper: "1-2.5 kg" } : { lower: "5-10 lb", upper: "2.5-5 lb" };
  const days = plan.days_per_week;
  const equipment = plan.equipment.map((item) => ES_EQUIPMENT[item] ?? item);
  const sessions = plan.sessions.map((session, index) => ({
    ...session,
    day_label: `Semana 1 Día ${index + 1} - ${ES_FOCUS[session.focus] ?? session.focus}`,
    focus: ES_FOCUS[session.focus] ?? session.focus,
    exercises: session.exercises.map((item) => {
      const lowerBody = item.primary_muscles.some((muscle) => ["quads", "glutes", "hamstrings"].includes(muscle));
      const increment = lowerBody ? increments.lower : increments.upper;
      return {
        ...item,
        name: esName(item.name),
        target_load: "Elige una carga controlada que te deje unas 2-3 repeticiones buenas en reserva.",
        progression_rule: `Cuando cada serie llegue al tope del rango con técnica limpia y 2+ repeticiones en reserva, agrega ${increment} la próxima vez.`,
        substitutions: item.substitutions.map(esName),
        coach_notes: ES_NOTES[item.name] ?? item.coach_notes,
      };
    }),
  }));

  return {
    status: response.status,
    summary: `Preparé un plan inicial confiable para ${(ES_GOALS[plan.goal] ?? plan.goal).toLowerCase()}. Asumí ${days} día${days === 1 ? "" : "s"} de entrenamiento por semana, ${equipment.join(" y ")} y experiencia ${ES_EXPERIENCE[plan.experience_level]}. Puedes usar este plan de inmediato aunque la personalización adicional de Coach no esté disponible, y puedes cambiar cualquier supuesto en el chat.`,
    plan: {
      ...plan,
      goal: ES_GOALS[plan.goal] ?? plan.goal,
      equipment,
      split: plan.split === "Full Body" ? "Cuerpo Completo" : "Cuerpo Completo A / B alternado",
      constraints: plan.constraints.length
        ? ["La persona reportó dolor o una limitación; evita cualquier movimiento que reproduzca los síntomas y busca orientación profesional si continúan."]
        : [],
      progression_strategy:
        "Repite la estructura semanal durante tres semanas. Agrega repeticiones antes que carga, y sube el peso solo cuando completes todas las series con técnica limpia y al menos dos repeticiones en reserva.",
      sessions,
      weekly_notes:
        "Deja al menos un día de recuperación entre las sesiones de cuerpo completo más exigentes cuando sea posible. Si tu disposición es baja, mantén los mismos ejercicios y quita una serie de cada movimiento.",
      safety_flags: plan.safety_flags.length ? ["No entrenes a través de un dolor agudo, creciente o inestable."] : [],
    },
  };
}

/* Layer 2: same-day adjustments made with rules only. No AI call, no new
   exercises beyond the ones already reviewed in the plan or its substitutions. */

export type ReliableSession = ReliablePlan["sessions"][number];

export type TodayContext = {
  readiness: "good" | "okay" | "poor";
  pain: boolean;
  availableMinutes?: number | null;
  unavailableEquipment?: string[];
};

export type SessionChange =
  | { code: "pain_guardrail" }
  | { code: "sets_reduced"; exercise_id: string; from: number; to: number }
  | { code: "effort_capped"; exercise_id: string; from: number; to: number }
  | { code: "exercise_substituted"; exercise_id: string; to: string }
  | { code: "exercise_removed"; exercise_id: string };

const MIN_EXERCISES = 2;
const WORK_SECONDS_PER_SET = 45;
const WARMUP_MINUTES = 5;

export function estimateSessionMinutes(exercises: ReliableExercise[]): number {
  const seconds = exercises.reduce(
    (total, item) => total + item.sets * (item.rest_seconds + WORK_SECONDS_PER_SET),
    0
  );
  return Math.round(seconds / 60) + WARMUP_MINUTES;
}

function estimateMinutes(session: ReliableSession): number {
  return estimateSessionMinutes(session.exercises);
}

function minSetsFor(item: ReliableExercise): number {
  return item.category === "compound" ? 2 : 1;
}

function matchesEquipment(text: string, unavailable: string[]): boolean {
  const haystack = text.toLowerCase();
  return unavailable.some((item) => {
    const needle = item.trim().toLowerCase();
    return needle.length > 2 && haystack.includes(needle);
  });
}

export function adjustSessionForToday(
  session: ReliableSession,
  context: TodayContext
): { session: ReliableSession; changes: SessionChange[] } {
  const changes: SessionChange[] = [];
  const unavailable = context.unavailableEquipment ?? [];
  let exercises = session.exercises.map((item) => ({ ...item }));

  // 1. Equipment the user cannot reach today: substitute from the reviewed list,
  //    and only drop a movement when a safe substitute is unavailable.
  if (unavailable.length > 0) {
    const kept: ReliableExercise[] = [];
    for (const item of exercises) {
      if (!matchesEquipment(`${item.name} ${item.primary_muscles.join(" ")}`, unavailable)) {
        kept.push(item);
        continue;
      }
      const replacement = item.substitutions.find((name) => !matchesEquipment(name, unavailable));
      if (replacement) {
        kept.push({
          ...item,
          exercise_id: slugify(replacement),
          name: replacement,
          substitutions: [item.name, ...item.substitutions.filter((name) => name !== replacement)],
        });
        changes.push({ code: "exercise_substituted", exercise_id: item.exercise_id, to: replacement });
      } else if (kept.length + 1 > MIN_EXERCISES) {
        changes.push({ code: "exercise_removed", exercise_id: item.exercise_id });
      } else {
        kept.push(item);
      }
    }
    exercises = kept.length >= MIN_EXERCISES ? kept : exercises;
  }

  // 2. Readiness and pain lower the dose; they never raise it.
  const effortCap = context.pain ? 6 : context.readiness === "poor" ? 6 : null;
  const dropSetsFromAll = context.readiness === "poor";
  const dropSetsFromAccessories = context.readiness === "okay";

  exercises = exercises.map((item) => {
    const next = { ...item };
    const shouldDrop = dropSetsFromAll || (dropSetsFromAccessories && item.category !== "compound");
    if (shouldDrop) {
      const target = Math.max(minSetsFor(item), item.sets - 1);
      if (target !== item.sets) {
        changes.push({ code: "sets_reduced", exercise_id: item.exercise_id, from: item.sets, to: target });
        next.sets = target;
      }
    }
    if (effortCap !== null && next.target_rpe !== null && next.target_rpe > effortCap) {
      changes.push({ code: "effort_capped", exercise_id: item.exercise_id, from: next.target_rpe, to: effortCap });
      next.target_rpe = effortCap;
    }
    return next;
  });

  if (context.pain) {
    changes.push({ code: "pain_guardrail" });
  }

  // 3. Time limit: trim accessories first, then sets, never below the floor.
  const available = context.availableMinutes ?? null;
  if (available && available > 0) {
    let guard = 0;
    while (estimateMinutes({ ...session, exercises }) > available && guard < 40) {
      guard += 1;
      const accessoryIndex = exercises.map((item) => item.category).lastIndexOf("accessory");
      if (accessoryIndex >= 0 && exercises.length > MIN_EXERCISES) {
        changes.push({ code: "exercise_removed", exercise_id: exercises[accessoryIndex].exercise_id });
        exercises = exercises.filter((_, index) => index !== accessoryIndex);
        continue;
      }
      const trimIndex = exercises.map((item) => item.sets > minSetsFor(item)).lastIndexOf(true);
      if (trimIndex < 0) break;
      const item = exercises[trimIndex];
      changes.push({ code: "sets_reduced", exercise_id: item.exercise_id, from: item.sets, to: item.sets - 1 });
      exercises = exercises.map((entry, index) => (index === trimIndex ? { ...entry, sets: entry.sets - 1 } : entry));
    }
  }

  const adjusted: ReliableSession = {
    ...session,
    exercises,
    estimated_minutes: estimateMinutes({ ...session, exercises }),
  };
  return { session: adjusted, changes };
}

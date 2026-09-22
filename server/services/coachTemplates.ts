import type { Exercise, Plan, Session, Units } from "./coachTrainerService";

// Template content for the rules-first Coach router. Everything here is
// deterministic, conservative (RPE 6, 2-3 sets, small jumps), and bilingual.
// exercise_id is always derived from the English name so history stays matched
// across languages.

export type Language = "en" | "es";
export type BeginnerGoal = "general_fitness" | "fat_loss" | "hypertrophy" | "strength";
export type BeginnerEquipment = "gym" | "home_dumbbells" | "bodyweight";

type Bilingual = { en: string; es: string };

export type MovementPattern =
  | "squat"
  | "lunge"
  | "hinge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "lateral_delt"
  | "calf"
  | "core_stability";
export type EquipmentType = "machine" | "dumbbell" | "bodyweight";

type Move = {
  pattern: MovementPattern;
  equip: EquipmentType;
  name: Bilingual;
  category: Exercise["category"];
  muscles: Array<keyof typeof MUSCLES>;
  loaded: boolean; // false = bodyweight only
  main: boolean; // 3 sets instead of 2
  core?: boolean;
  cue: Bilingual;
  substitutions: Bilingual[];
};

const MUSCLES = {
  quads: { en: "quads", es: "cuádriceps" },
  glutes: { en: "glutes", es: "glúteos" },
  hamstrings: { en: "hamstrings", es: "isquiotibiales" },
  chest: { en: "chest", es: "pecho" },
  back: { en: "back", es: "espalda" },
  shoulders: { en: "shoulders", es: "hombros" },
  triceps: { en: "triceps", es: "tríceps" },
  biceps: { en: "biceps", es: "bíceps" },
  core: { en: "core", es: "core" },
  calves: { en: "calves", es: "pantorrillas" },
} as const;

const MOVES: Record<string, Move> = {
  leg_press: {
    pattern: "squat", equip: "machine",
    name: { en: "Leg Press", es: "Prensa de piernas" }, category: "compound", muscles: ["quads", "glutes"], loaded: true, main: true,
    cue: { en: "Feet shoulder-width, lower until your knees are about 90 degrees, and press without locking out.", es: "Pies al ancho de hombros, baja hasta unos 90 grados de rodilla y empuja sin bloquear las rodillas." },
    substitutions: [{ en: "Goblet Squat", es: "Sentadilla goblet" }],
  },
  goblet_squat: {
    pattern: "squat", equip: "dumbbell",
    name: { en: "Goblet Squat", es: "Sentadilla goblet" }, category: "compound", muscles: ["quads", "glutes"], loaded: true, main: true,
    cue: { en: "Hold the weight at your chest, keep your chest tall, and sit down between your hips.", es: "Sostén el peso al pecho, mantén el torso erguido y siéntate entre las caderas." },
    substitutions: [{ en: "Leg Press", es: "Prensa de piernas" }, { en: "Sit-to-Stand Squat", es: "Sentadilla a silla" }],
  },
  box_squat: {
    pattern: "squat", equip: "bodyweight",
    name: { en: "Sit-to-Stand Squat", es: "Sentadilla a silla" }, category: "compound", muscles: ["quads", "glutes"], loaded: false, main: true,
    cue: { en: "Sit back to a chair, touch lightly, and stand up without using your hands.", es: "Siéntate hacia una silla, toca ligeramente y ponte de pie sin usar las manos." },
    substitutions: [{ en: "Supported Split Squat", es: "Zancada dividida con apoyo" }],
  },
  split_squat: {
    pattern: "lunge", equip: "bodyweight",
    name: { en: "Supported Split Squat", es: "Zancada dividida con apoyo" }, category: "compound", muscles: ["quads", "glutes"], loaded: false, main: true,
    cue: { en: "Hold a wall or chair for balance, lower straight down, and keep your front foot flat.", es: "Sujétate de una pared o silla para equilibrarte, baja recto y mantén el pie delantero apoyado." },
    substitutions: [{ en: "Sit-to-Stand Squat", es: "Sentadilla a silla" }],
  },
  machine_chest_press: {
    pattern: "horizontal_push", equip: "machine",
    name: { en: "Machine Chest Press", es: "Press de pecho en máquina" }, category: "compound", muscles: ["chest", "shoulders", "triceps"], loaded: true, main: true,
    cue: { en: "Set the seat so handles line up with mid-chest; press smoothly and control the return.", es: "Ajusta el asiento para que los agarres queden a la altura del pecho; empuja suave y controla el regreso." },
    substitutions: [{ en: "Dumbbell Bench Press", es: "Press de banca con mancuernas" }],
  },
  db_bench: {
    pattern: "horizontal_push", equip: "dumbbell",
    name: { en: "Dumbbell Bench Press", es: "Press de banca con mancuernas" }, category: "compound", muscles: ["chest", "shoulders", "triceps"], loaded: true, main: true,
    cue: { en: "Feet planted, shoulder blades back, lower until your elbows are just below the bench.", es: "Pies firmes, escápulas atrás y baja hasta que los codos queden justo por debajo del banco." },
    substitutions: [{ en: "Machine Chest Press", es: "Press de pecho en máquina" }],
  },
  db_floor_press: {
    pattern: "horizontal_push", equip: "dumbbell",
    name: { en: "Dumbbell Floor Press", es: "Press de suelo con mancuernas" }, category: "compound", muscles: ["chest", "triceps", "shoulders"], loaded: true, main: true,
    cue: { en: "Lie on the floor, lower until your upper arms touch down, then press up in a straight line.", es: "Acuéstate en el suelo, baja hasta que los brazos toquen el piso y empuja en línea recta." },
    substitutions: [{ en: "Incline Push-Up", es: "Flexiones inclinadas" }],
  },
  incline_pushup: {
    pattern: "horizontal_push", equip: "bodyweight",
    name: { en: "Incline Push-Up", es: "Flexiones inclinadas" }, category: "compound", muscles: ["chest", "shoulders", "triceps"], loaded: false, main: true,
    cue: { en: "Hands on a counter or sturdy table, body in one line, lower your chest toward your hands.", es: "Manos en una encimera o mesa firme, cuerpo en línea recta y baja el pecho hacia las manos." },
    substitutions: [{ en: "Wall Push-Up", es: "Flexiones en pared" }],
  },
  seated_cable_row: {
    pattern: "horizontal_pull", equip: "machine",
    name: { en: "Seated Cable Row", es: "Remo sentado en polea" }, category: "compound", muscles: ["back", "biceps"], loaded: true, main: true,
    cue: { en: "Sit tall, pull your elbows back toward your ribs, and pause briefly before returning.", es: "Siéntate erguido, lleva los codos hacia las costillas y haz una pausa breve antes de regresar." },
    substitutions: [{ en: "Lat Pulldown", es: "Jalón al pecho" }],
  },
  lat_pulldown: {
    pattern: "vertical_pull", equip: "machine",
    name: { en: "Lat Pulldown", es: "Jalón al pecho" }, category: "compound", muscles: ["back", "biceps"], loaded: true, main: true,
    cue: { en: "Pull the bar to your upper chest, elbows down and in, without leaning far back.", es: "Lleva la barra a la parte alta del pecho, codos abajo y hacia adentro, sin inclinarte mucho hacia atrás." },
    substitutions: [{ en: "Seated Cable Row", es: "Remo sentado en polea" }],
  },
  one_arm_row: {
    pattern: "horizontal_pull", equip: "dumbbell",
    name: { en: "One-Arm Dumbbell Row", es: "Remo con mancuerna a una mano" }, category: "compound", muscles: ["back", "biceps"], loaded: true, main: true,
    cue: { en: "Support yourself on a bench or sturdy chair, keep your back flat, and row to your hip.", es: "Apóyate en un banco o silla firme, espalda plana y rema hacia la cadera." },
    substitutions: [{ en: "Two-Dumbbell Bent-Over Row", es: "Remo inclinado con dos mancuernas" }],
  },
  bent_over_row: {
    pattern: "horizontal_pull", equip: "dumbbell",
    name: { en: "Two-Dumbbell Bent-Over Row", es: "Remo inclinado con dos mancuernas" }, category: "compound", muscles: ["back", "biceps"], loaded: true, main: true,
    cue: { en: "Hinge at the hips with a flat back and pull both elbows toward the ceiling.", es: "Inclínate desde la cadera con la espalda plana y lleva ambos codos hacia el techo." },
    substitutions: [{ en: "One-Arm Dumbbell Row", es: "Remo con mancuerna a una mano" }],
  },
  prone_y_raise: {
    pattern: "horizontal_pull", equip: "bodyweight",
    name: { en: "Prone Y Raise", es: "Elevación en Y boca abajo" }, category: "accessory", muscles: ["back", "shoulders"], loaded: false, main: false,
    cue: { en: "Lie face down, lift your arms in a Y shape with thumbs up, and squeeze your shoulder blades.", es: "Acuéstate boca abajo, levanta los brazos en Y con los pulgares arriba y aprieta las escápulas." },
    substitutions: [{ en: "Prone T Raise", es: "Elevación en T boca abajo" }],
  },
  prone_t_raise: {
    pattern: "horizontal_pull", equip: "bodyweight",
    name: { en: "Prone T Raise", es: "Elevación en T boca abajo" }, category: "accessory", muscles: ["back", "shoulders"], loaded: false, main: false,
    cue: { en: "Lie face down, lift your arms out to the sides, and squeeze your shoulder blades together.", es: "Acuéstate boca abajo, levanta los brazos a los lados y junta las escápulas." },
    substitutions: [{ en: "Prone Y Raise", es: "Elevación en Y boca abajo" }],
  },
  db_shoulder_press: {
    pattern: "vertical_push", equip: "dumbbell",
    name: { en: "Seated Dumbbell Shoulder Press", es: "Press de hombros con mancuernas sentado" }, category: "accessory", muscles: ["shoulders", "triceps"], loaded: true, main: false,
    cue: { en: "Ribs down, press straight up without arching your lower back.", es: "Costillas abajo y empuja recto hacia arriba sin arquear la espalda baja." },
    substitutions: [{ en: "Dumbbell Lateral Raise", es: "Elevaciones laterales con mancuernas" }],
  },
  lateral_raise: {
    pattern: "lateral_delt", equip: "dumbbell",
    name: { en: "Dumbbell Lateral Raise", es: "Elevaciones laterales con mancuernas" }, category: "accessory", muscles: ["shoulders"], loaded: true, main: false,
    cue: { en: "Use very light weights, lead with your elbows, and stop at shoulder height.", es: "Usa pesos muy ligeros, guía con los codos y detente a la altura de los hombros." },
    substitutions: [{ en: "Seated Dumbbell Shoulder Press", es: "Press de hombros con mancuernas sentado" }],
  },
  db_rdl: {
    pattern: "hinge", equip: "dumbbell",
    name: { en: "Dumbbell Romanian Deadlift", es: "Peso muerto rumano con mancuernas" }, category: "compound", muscles: ["hamstrings", "glutes", "back"], loaded: true, main: true,
    cue: { en: "Push your hips back with soft knees and a flat back until you feel your hamstrings stretch.", es: "Lleva la cadera hacia atrás con rodillas ligeramente flexionadas y espalda plana hasta sentir el estiramiento de los isquiotibiales." },
    substitutions: [{ en: "Glute Bridge", es: "Puente de glúteos" }],
  },
  glute_bridge: {
    pattern: "hinge", equip: "bodyweight",
    name: { en: "Glute Bridge", es: "Puente de glúteos" }, category: "accessory", muscles: ["glutes", "hamstrings"], loaded: false, main: false,
    cue: { en: "Drive through your heels, squeeze your glutes at the top, and keep your ribs down.", es: "Empuja con los talones, aprieta los glúteos arriba y mantén las costillas abajo." },
    substitutions: [{ en: "Dumbbell Romanian Deadlift", es: "Peso muerto rumano con mancuernas" }],
  },
  hip_hinge: {
    pattern: "hinge", equip: "bodyweight",
    name: { en: "Bodyweight Hip Hinge", es: "Bisagra de cadera con peso corporal" }, category: "accessory", muscles: ["hamstrings", "glutes"], loaded: false, main: false,
    cue: { en: "Hands on hips, push your hips back with a flat back, then stand tall by squeezing your glutes.", es: "Manos en la cadera, lleva la cadera atrás con la espalda plana y ponte erguido apretando los glúteos." },
    substitutions: [{ en: "Glute Bridge", es: "Puente de glúteos" }],
  },
  calf_raise: {
    pattern: "calf", equip: "bodyweight",
    name: { en: "Standing Calf Raise", es: "Elevación de talones de pie" }, category: "accessory", muscles: ["calves"], loaded: false, main: false,
    cue: { en: "Rise onto the balls of your feet, pause at the top, and lower slowly.", es: "Sube sobre la punta de los pies, haz una pausa arriba y baja lento." },
    substitutions: [{ en: "Seated Calf Raise", es: "Elevación de talones sentado" }],
  },
  dead_bug: {
    pattern: "core_stability", equip: "bodyweight",
    name: { en: "Dead Bug", es: "Bicho muerto" }, category: "accessory", muscles: ["core"], loaded: false, main: false, core: true,
    cue: { en: "Keep your lower back gently pressed down as you extend opposite arm and leg. Reps are per side.", es: "Mantén la espalda baja presionada suavemente mientras extiendes brazo y pierna opuestos. Las repeticiones son por lado." },
    substitutions: [{ en: "Bird Dog", es: "Perro de caza" }],
  },
  bird_dog: {
    pattern: "core_stability", equip: "bodyweight",
    name: { en: "Bird Dog", es: "Perro de caza" }, category: "accessory", muscles: ["core", "glutes"], loaded: false, main: false, core: true,
    cue: { en: "Reach opposite arm and leg long without rotating your hips. Reps are per side.", es: "Extiende brazo y pierna opuestos sin rotar la cadera. Las repeticiones son por lado." },
    substitutions: [{ en: "Dead Bug", es: "Bicho muerto" }],
  },
};

type Slots = {
  squat: string[];
  push: string[];
  pull: string[];
  hinge: string[];
  shoulder: string[];
  core: string[];
};

const SLOTS: Record<BeginnerEquipment, Slots> = {
  gym: {
    squat: ["leg_press", "goblet_squat"],
    push: ["machine_chest_press", "db_bench"],
    pull: ["seated_cable_row", "lat_pulldown"],
    hinge: ["db_rdl", "glute_bridge"],
    shoulder: ["db_shoulder_press", "lateral_raise"],
    core: ["dead_bug", "bird_dog"],
  },
  home_dumbbells: {
    squat: ["goblet_squat", "split_squat"],
    push: ["db_floor_press", "db_shoulder_press"],
    pull: ["one_arm_row", "bent_over_row"],
    hinge: ["db_rdl", "glute_bridge"],
    shoulder: ["db_shoulder_press", "lateral_raise"],
    core: ["dead_bug", "bird_dog"],
  },
  bodyweight: {
    squat: ["box_squat", "split_squat"],
    push: ["incline_pushup", "incline_pushup"],
    pull: ["prone_y_raise", "prone_t_raise"],
    hinge: ["glute_bridge", "hip_hinge"],
    shoulder: ["prone_t_raise", "prone_y_raise"],
    core: ["dead_bug", "bird_dog"],
  },
};

const EQUIPMENT_LABEL: Record<BeginnerEquipment, { list: Bilingual[]; sentence: Bilingual }> = {
  gym: { list: [{ en: "Full gym", es: "Gimnasio completo" }], sentence: { en: "a full gym", es: "un gimnasio completo" } },
  home_dumbbells: { list: [{ en: "Dumbbells at home", es: "Mancuernas en casa" }], sentence: { en: "dumbbells at home", es: "mancuernas en casa" } },
  bodyweight: { list: [{ en: "Bodyweight only", es: "Solo peso corporal" }], sentence: { en: "bodyweight only", es: "solo peso corporal" } },
};

const GOAL_LABEL: Record<BeginnerGoal, Bilingual> = {
  general_fitness: { en: "general fitness", es: "estar en forma" },
  fat_loss: { en: "losing fat", es: "perder grasa" },
  hypertrophy: { en: "building muscle", es: "ganar músculo" },
  strength: { en: "getting stronger", es: "ganar fuerza" },
};

// Beginners: 8-12 reps for every goal (core holds are 6-10 per side).
const BEGINNER_REPS: [number, number] = [8, 12];

const pick = (value: Bilingual, language: Language) => value[language];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildExercise(key: string, goal: BeginnerGoal, units: Units, language: Language): Exercise {
  const move = MOVES[key];
  const isEs = language === "es";
  const increment = units === "kg" ? "2.5 kg" : "5 lb";
  const [minReps, maxReps] = move.core ? [6, 10] : BEGINNER_REPS;

  const targetLoad = move.loaded
    ? isEs
      ? "Empieza ligero: elige un peso con el que te sobrarían 3-4 repeticiones (RPE 6)."
      : "Start light: pick a weight where you could do 3-4 more reps (RPE 6)."
    : isEs
      ? "Peso corporal."
      : "Bodyweight.";

  const progressionRule = move.loaded
    ? isEs
      ? `Sube el peso cuando completes todas las series en ${maxReps} repeticiones con buena técnica en dos sesiones seguidas (o puedas hacer 2 repeticiones extra sobre tu objetivo durante dos semanas seguidas). Usa el salto más pequeño disponible (unos ${increment}), nunca más de aproximadamente 10 % del peso actual; si ese salto es mayor, añade una repetición. No subas peso y repeticiones a la vez.`
      : `Add weight once you complete every set at ${maxReps} reps with good form in two sessions in a row (or can do 2 extra reps beyond target for two weeks straight). Use the smallest jump available (about ${increment}), never more than about 10% of the current weight; if that jump is bigger, add a rep instead. Don't raise weight and reps at the same time.`
    : isEs
      ? `Cuando completes todas las series en ${maxReps} repeticiones con buena técnica en dos sesiones seguidas, hazlo más difícil (bajada más lenta, pausa o una variante más difícil) en lugar de añadir más repeticiones.`
      : `When you complete every set at ${maxReps} reps with good form in two sessions in a row, make it harder (slower lowering, a pause, or a harder variation) instead of adding more reps.`;

  return {
    exercise_id: slug(move.name.en),
    name: pick(move.name, language),
    category: move.category,
    primary_muscles: move.muscles.map((muscle) => MUSCLES[muscle][language]),
    sets: move.main ? 3 : 2,
    rep_range: { min: minReps, max: maxReps },
    target_rpe: 6,
    target_load: targetLoad,
    rest_seconds: move.core ? 45 : move.main ? 90 : 60,
    tempo: null,
    progression_rule: progressionRule,
    substitutions: move.substitutions.map((sub) => pick(sub, language)),
    coach_notes: pick(move.cue, language),
  };
}

function dedupe(keys: string[]): string[] {
  return keys.filter((key, index) => keys.indexOf(key) === index);
}

function sessionKeys(equipment: BeginnerEquipment, days: number, dayIndex: number, count: number): { keys: string[]; focus: Bilingual; label: Bilingual } {
  const s = SLOTS[equipment];
  const variant = dayIndex % 2;
  const letter = ["A", "B", "A"][dayIndex];
  return {
    keys: dedupe([s.squat[variant], s.push[variant], s.pull[variant], s.hinge[variant], s.core[variant]]).slice(0, count),
    focus: { en: "Full body", es: "Cuerpo completo" },
    label: { en: `Full Body ${letter}`, es: `Cuerpo completo ${letter}` },
  };
}

export type BeginnerPlanInput = {
  units: Units;
  language: Language;
  goal: BeginnerGoal;
  equipment: BeginnerEquipment;
  daysPerWeek: 2 | 3;
  sessionMinutes: number;
};

export function buildBeginnerPlanResponse(input: BeginnerPlanInput): { status: "plan_ready"; summary: string; plan: Plan } {
  const { units, language, goal, equipment, daysPerWeek, sessionMinutes } = input;
  const isEs = language === "es";
  const exercisesPerSession = sessionMinutes <= 35 ? 4 : 5;
  const increment = units === "kg" ? "2.5 kg" : "5 lb";

  const sessions: Session[] = Array.from({ length: daysPerWeek }, (_, dayIndex) => {
    const { keys, focus, label } = sessionKeys(equipment, daysPerWeek, dayIndex, exercisesPerSession);
    const dayPrefix = isEs ? `Semana 1 Día ${dayIndex + 1}` : `Week 1 Day ${dayIndex + 1}`;
    return {
      day_label: `${dayPrefix} - ${pick(label, language)}`,
      focus: pick(focus, language),
      estimated_minutes: sessionMinutes,
      exercises: keys.map((key) => buildExercise(key, goal, units, language)),
    };
  });

  // The app tracks completion by exercise_id, so ids must be unique across the whole
  // plan. A movement repeated on a later day gets a stable numeric suffix ("-2", "-3");
  // the first occurrence keeps the plain id.
  const seen = new Map<string, number>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const count = (seen.get(exercise.exercise_id) ?? 0) + 1;
      seen.set(exercise.exercise_id, count);
      if (count > 1) exercise.exercise_id = `${exercise.exercise_id}-${count}`;
    }
  }

  const split = isEs ? "Cuerpo completo" : "Full Body";

  const plan: Plan = {
    goal: pick(GOAL_LABEL[goal], language),
    goal_type: goal,
    experience_level: "beginner",
    units,
    timeline_weeks: 3,
    days_per_week: daysPerWeek,
    split,
    equipment: EQUIPMENT_LABEL[equipment].list.map((item) => pick(item, language)),
    constraints: [isEs ? "Sin lesiones ni limitaciones de salud reportadas" : "No injuries or health limitations reported"],
    progression_strategy: isEs
      ? `Las semanas 2 y 3 repiten estas sesiones. Sube primero las repeticiones; añade la carga mínima disponible (${increment}, nunca más de aproximadamente 10 %) solo cuando todas las series lleguen al tope del rango con buena técnica en dos sesiones seguidas.`
      : `Weeks 2 and 3 repeat these sessions. Add reps first; add the smallest available load (${increment}, never more than about 10%) only when every set reaches the top of the range with good form in two sessions in a row.`,
    sessions,
    weekly_notes: isEs
      ? "Deja al menos un día de descanso entre sesiones. Si sientes dolor agudo o inusual, dolor en el pecho o mareo, detente y consulta con un profesional de salud antes de continuar. Si una semana se siente demasiado difícil, repítela en lugar de añadir peso."
      : "Leave at least one rest day between sessions. If you feel sharp or unusual pain, chest pain, or dizziness, stop and check in with a licensed healthcare professional before continuing. If a week feels too hard, repeat it instead of adding weight.",
    safety_flags: [],
  };

  const summary = isEs
    ? `Este es un plan sencillo para principiantes de ${daysPerWeek} días por semana (${split.toLowerCase()}), enfocado en ${pick(GOAL_LABEL[goal], language)} y usando ${pick(EQUIPMENT_LABEL[equipment].sentence, language)}. Supuestos: unos ${sessionMinutes} minutos por sesión, sin lesiones ni limitaciones de salud, y que estás empezando a entrenar; dime si algo de esto no es correcto y lo ajusto. Empieza ligero (RPE 6, con 3-4 repeticiones de reserva), cuida la técnica y ${equipment === "bodyweight" ? "añade repeticiones" : "sube el peso"} solo cuando cada serie se sienta fluida. El bloque dura 3 semanas: las semanas 2 y 3 repiten estas sesiones con pequeñas progresiones.`
    : `Here is a simple ${daysPerWeek}-day beginner plan (${split.toLowerCase()}) focused on ${pick(GOAL_LABEL[goal], language)}, using ${pick(EQUIPMENT_LABEL[equipment].sentence, language)}. Assumptions: about ${sessionMinutes} minutes per session, no injuries or health limitations, and that you are new to training; tell me if any of that is off and I will adjust it. Start light (RPE 6, with 3-4 reps in reserve), keep your form clean, and ${equipment === "bodyweight" ? "add reps" : "add weight"} only when every set feels smooth. The block runs 3 weeks: weeks 2 and 3 repeat these sessions with small progressions.`;

  return { status: "plan_ready", summary, plan };
}

export function buildViewPlanReply(plan: Plan, language: Language): string {
  const isEs = language === "es";
  const header = isEs
    ? `Tu plan actual: ${plan.goal} · ${plan.days_per_week} días por semana · ${plan.split}.`
    : `Your current plan: ${plan.goal} · ${plan.days_per_week} days per week · ${plan.split}.`;
  const sessions = plan.sessions.map((session) => {
    const lines = session.exercises.map((exercise) => {
      const reps = exercise.rep_range.min === exercise.rep_range.max
        ? `${exercise.rep_range.min}`
        : `${exercise.rep_range.min}-${exercise.rep_range.max}`;
      return `- ${exercise.name}: ${exercise.sets} × ${reps}`;
    });
    return `${session.day_label} (${session.estimated_minutes} min)\n${lines.join("\n")}`;
  });
  const footer = isEs
    ? "Abre la pestaña Plan para registrar tus entrenamientos."
    : "Open the Plan tab to log your workouts.";
  return [header, ...sessions, footer].join("\n\n");
}

// Exposed for the stage-two Coach knowledge (swaps, explanations).
export const MOVE_LIBRARY = MOVES;
export { buildExercise as buildExerciseFromMove };
export type MoveInfo = Move;

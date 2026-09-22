import type { CoachResponse, Exercise, Plan, Units } from "./coachTrainerService";
import {
  MOVE_LIBRARY,
  buildExerciseFromMove,
  buildViewPlanReply,
  type BeginnerGoal,
  type EquipmentType,
  type Language,
  type MovementPattern,
} from "./coachTemplates";
import { normalizeText } from "./coachText";
import * as knowledge from "./coachKnowledge";

// Stage-two Coach intents: the ongoing coaching relationship after a plan exists.
// Each matcher is deliberately narrow. When a message matches no intent, matches
// more than one, or trips an escalation rule, it goes to the AI pipeline.
// The caller (coachRouter) has already run the risk screen (injury, pain, medical
// condition, medication, pregnancy, minors, eating behaviour) before this runs.

export type Stage2Intent =
  | "progression_rule"
  | "difficulty_feedback"
  | "missed_workout"
  | "soreness"
  | "substitution"
  | "swap_applied"
  | "why_exercise"
  | "frequency_volume"
  | "nutrition"
  | "view_plan";

export type Stage2Decision =
  | { route: "rules"; intent: Stage2Intent; response: CoachResponse }
  | { route: "ai"; reason: string };

export type Stage2Context = {
  text: string; // raw (used for numbers like body weight)
  normalized: string;
  units: Units;
  language: Language;
  currentPlan: Plan | null;
};

// ---- Exercise library lookup (movement pattern + equipment) ----------------------------

const ALIASES: Record<string, string[]> = {
  leg_press: ["leg press", "prensa de piernas", "prensa"],
  goblet_squat: ["goblet squat", "sentadilla goblet", "goblet"],
  box_squat: ["sit to stand squat", "sit to stand", "chair squat", "box squat", "sentadilla a silla"],
  split_squat: ["supported split squat", "split squat", "zancada dividida con apoyo", "zancada dividida"],
  machine_chest_press: ["machine chest press", "chest press machine", "chest press", "press de pecho en maquina", "press de pecho"],
  db_bench: ["dumbbell bench press", "dumbbell bench", "db bench", "bench press", "press de banca con mancuernas", "press de banca"],
  db_floor_press: ["dumbbell floor press", "floor press", "press de suelo con mancuernas", "press de suelo"],
  incline_pushup: ["incline push up", "incline pushup", "push up", "push ups", "pushup", "pushups", "flexiones inclinadas", "flexiones"],
  seated_cable_row: ["seated cable row", "cable row", "seated row", "remo sentado en polea", "remo en polea"],
  lat_pulldown: ["lat pulldown", "lat pull down", "pulldown", "jalon al pecho", "jalon"],
  one_arm_row: ["one arm dumbbell row", "one arm row", "dumbbell row", "remo con mancuerna a una mano"],
  bent_over_row: ["two dumbbell bent over row", "bent over row", "remo inclinado con dos mancuernas", "remo inclinado"],
  prone_y_raise: ["prone y raise", "y raise", "elevacion en y boca abajo", "elevacion en y"],
  prone_t_raise: ["prone t raise", "t raise", "elevacion en t boca abajo", "elevacion en t"],
  db_shoulder_press: ["seated dumbbell shoulder press", "dumbbell shoulder press", "shoulder press", "overhead press", "press de hombros con mancuernas sentado", "press de hombros"],
  lateral_raise: ["dumbbell lateral raise", "lateral raises", "lateral raise", "elevaciones laterales con mancuernas", "elevaciones laterales"],
  db_rdl: ["dumbbell romanian deadlift", "romanian deadlift", "rdl", "peso muerto rumano con mancuernas", "peso muerto rumano"],
  glute_bridge: ["glute bridge", "puente de gluteos"],
  hip_hinge: ["bodyweight hip hinge", "hip hinge", "bisagra de cadera con peso corporal", "bisagra de cadera"],
  calf_raise: ["standing calf raise", "calf raises", "calf raise", "elevacion de talones de pie", "elevacion de talones"],
  dead_bug: ["dead bug", "bicho muerto"],
  bird_dog: ["bird dog", "perro de caza"],
};

const GENERIC_WORDS: Array<[RegExp, MovementPattern]> = [
  [/\b(?:squats?|sentadillas?)\b/, "squat"],
  [/\b(?:lunges?|zancadas?)\b/, "lunge"],
  [/\b(?:rows?|remos?)\b/, "horizontal_pull"],
  [/\b(?:deadlifts?|pesos? muertos?)\b/, "hinge"],
  [/\b(?:pull ?downs?|jalones?)\b/, "vertical_pull"],
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ID_TO_KEY = new Map(Object.entries(MOVE_LIBRARY).map(([key, move]) => [slug(move.name.en), key]));

function containsPhrase(normalized: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`).test(normalized);
}

function moveKeyOfExercise(exercise: Exercise): string | null {
  const byId = ID_TO_KEY.get(exercise.exercise_id.replace(/-\d+$/, ""));
  if (byId) return byId;
  const name = normalizeText(exercise.name);
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (aliases.includes(name)) return key;
  }
  return null;
}

type PlanMove = { key: string; exercises: Exercise[] };

function planMoves(plan: Plan): PlanMove[] {
  const map = new Map<string, PlanMove>();
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      const key = moveKeyOfExercise(exercise);
      if (!key) continue;
      const entry = map.get(key) ?? { key, exercises: [] };
      entry.exercises.push(exercise);
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

// The single plan exercise the message refers to, or null when none or ambiguous.
function findMentionedPlanMove(plan: Plan, normalized: string): PlanMove | null {
  const moves = planMoves(plan);
  const hits = moves.filter((move) => {
    const names = [...(ALIASES[move.key] ?? []), ...move.exercises.map((exercise) => normalizeText(exercise.name))];
    return names.some((name) => containsPhrase(normalized, name));
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;

  for (const [pattern, movementPattern] of GENERIC_WORDS) {
    if (!pattern.test(normalized)) continue;
    const byPattern = moves.filter((move) => MOVE_LIBRARY[move.key].pattern === movementPattern);
    return byPattern.length === 1 ? byPattern[0] : null;
  }
  return null;
}

// A library exercise named in the text (longest matching alias wins; ambiguous -> null).
function findLibraryMove(normalized: string): string | null {
  let best: { key: string; length: number } | null = null;
  let tie = false;
  for (const [key, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      if (!containsPhrase(normalized, alias)) continue;
      if (!best || alias.length > best.length) { best = { key, length: alias.length }; tie = false; }
      else if (alias.length === best.length && key !== best.key) tie = true;
    }
  }
  return best && !tie ? best.key : null;
}

function planEquipment(plan: Plan): Set<EquipmentType> | null {
  const text = normalizeText(plan.equipment.join(" "));
  if (/\b(gym|gimnasio|machines?|maquinas?|cables?|poleas?)\b/.test(text)) return new Set<EquipmentType>(["machine", "dumbbell", "bodyweight"]);
  if (/\b(dumbbells?|mancuernas?)\b/.test(text)) return new Set<EquipmentType>(["dumbbell", "bodyweight"]);
  if (/\b(bodyweight|body weight|peso corporal|no equipment|sin equipo)\b/.test(text)) return new Set<EquipmentType>(["bodyweight"]);
  return null;
}

function compatibleMoves(oldKey: string, available: Set<EquipmentType>, plan: Plan): string[] {
  const old = MOVE_LIBRARY[oldKey];
  // Do not suggest an exercise already in a session that contains the one being replaced.
  const sessionKeys = new Set<string>();
  for (const session of plan.sessions) {
    const keys = session.exercises.map(moveKeyOfExercise);
    if (keys.includes(oldKey)) keys.forEach((key) => key && sessionKeys.add(key));
  }
  return Object.entries(MOVE_LIBRARY)
    .filter(([key, move]) => key !== oldKey && move.pattern === old.pattern && available.has(move.equip) && !sessionKeys.has(key))
    .map(([key]) => key);
}

// ---- Duration parsing ----------------------------------------------------------------------

const NUMBER_WORD: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};
const COUNT = "(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";

// Longest period mentioned, in days; null when no duration is stated.
export function parseDurationDays(normalized: string): number | null {
  const found: number[] = [];
  const unit = (pattern: string, days: number) => {
    for (const match of normalized.matchAll(new RegExp(`(?<![a-z0-9])${COUNT}\\s*(?:${pattern})\\b`, "g"))) {
      const value = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORD[match[1]];
      found.push(value * days);
    }
  };
  unit("days?|dias?", 1);
  unit("weeks?|semanas?", 7);
  unit("months?|meses|mes", 30);
  if (/\b(?:couple of|couple) days\b|\bun par de dias\b/.test(normalized)) found.push(2);
  if (/\b(?:couple of|couple) weeks\b|\bun par de semanas\b/.test(normalized)) found.push(14);
  if (/\bfew days\b|\bunos dias\b|\bunos cuantos dias\b/.test(normalized)) found.push(3);
  if (/\bfew weeks\b|\bunas semanas\b|\bunas cuantas semanas\b/.test(normalized)) found.push(21);
  if (/\b(?:couple of|couple) months\b|\bun par de meses\b/.test(normalized)) found.push(60);
  if (/\bfew months\b|\bunos meses\b/.test(normalized)) found.push(90);
  if (/\b(?:last week|since last week|la semana pasada|desde la semana pasada|over a week)\b/.test(normalized)) found.push(7);
  if (/\b(?:over a month|more than a month|mas de un mes)\b/.test(normalized)) found.push(30);
  if (/\byesterday\b|\bayer\b/.test(normalized)) found.push(1);
  return found.length ? Math.max(...found) : null;
}

// ---- Matchers ----------------------------------------------------------------------------------

const PROGRESSION_PATTERNS: RegExp[] = [
  /\b(?:when|how|how do i|how do you)\b.*\b(?:increase|add|raise|progress|go up)\b.*\b(?:weight|weights|load|reps)\b/,
  /\b(?:can|should|do) i (?:go|lift) heavier\b/,
  /\bshould i (?:increase|add|raise|go up) (?:the )?(?:weight|load)\b/,
  /\bhow much (?:weight )?(?:should|can|do) i (?:increase|add|go up|raise)\b/,
  /\b(?:cuando|como)\b.*\b(?:subir|aumentar|progresar|agregar)\b.*\b(?:peso|carga|repeticiones)\b/,
  /\bdebo (?:subir|aumentar) (?:el )?(?:peso|la carga)\b/,
  /\bcuanto (?:peso )?(?:debo|puedo) (?:subir|aumentar|agregar)\b/,
];

const TOO_HARD = /\b(?:too hard|too heavy|too difficult|really hard|so hard|cant (?:finish|complete)|cannot (?:finish|complete)|exhausting|demasiado (?:dificil|pesado|duro)|muy (?:dificil|pesado|duro)|no puedo (?:terminar|completar))\b/;
const TOO_EASY = /\b(?:too easy|too light|not challenging|isnt challenging|not hard enough|demasiado (?:facil|ligero)|muy (?:facil|ligero)|poco desafiante)\b/;

const MISSED_PATTERNS: RegExp[] = [
  /\b(?:missed|skipped)\b.*\b(?:workouts?|sessions?|days?|weeks?|training|gym|entrenamientos?|sesion\w*|dias|semanas?)\b/,
  /\b(?:havent|have not|hasnt)\b.*\b(?:trained|worked out|lifted|been to the gym|exercised|entrenado|entrene)\b/,
  /\b(?:been away|time off|off for|away from (?:the )?(?:gym|training))\b/,
  /\btook \w+ (?:days?|weeks?|months?) off\b/,
  /\b(?:falte|me salte|no entrene|no he entrenado|deje de entrenar|estuve (?:fuera|sin entrenar)|sin entrenar)\b/,
];

const SORE = /\b(?:sore|soreness|doms|delayed onset|adolorid\w*|agujetas|muscle aches?)\b/;
const SORENESS_ESCALATION = /\b(?:sharp|stabbing|shooting|burning|swell\w*|swollen|bruis\w*|pop|popped|popping|click\w*|locked|gave out|unstable|numb\w*|worse|worsening|wont go away|not going away|doesnt go away|filoso|punzante|agudo|hinchaz\w*|moreton\w*|empeora\w*|no se quita|no desaparece)\b/;

const OUT_OF_SCOPE_NUTRITION = /\b(?:calories?|kcal|calorias?|diets?|dietas?|keto|macros?|meal plans?|deficit|surplus|bulk\w*|cutting|fat burners?|quemador\w*|steroids?|esteroides?|sarms?|testosterone|hgh|ephedra|clenbuterol|thermogenic\w*|termogenic\w*|pre ?workout|preentreno|bcaas?)\b/;
const PROTEIN = /\b(?:proteins?|proteinas?)\b/;
const TIMING_WHEN = /\b(?:before|after|pre|post)\s+(?:a\s+|my\s+|the\s+)?(?:training|workouts?|lifting|gym|sessions?|exercise)\b|\bmeal timing\b|\b(?:antes|despues) de (?:entrenar|ejercitarme|levantar|mi entrenamiento|el gym|el gimnasio)\b/;
// Timing only counts as a nutrition question when food is actually mentioned, so
// "sore after a workout" is not mistaken for "what to eat after a workout".
const FOOD_WORD = /\b(?:eat|eating|meal|meals|snack|food|carbs?|carbohydrates?|fuel|nutrition|comer|comida|comidas|cenar|carbohidratos|alimento\w*|nutricion)\b/;
const mealTiming = (normalized: string) => TIMING_WHEN.test(normalized) && FOOD_WORD.test(normalized);
const CREATINE = /\bcreatin\w*\b/;
const CAFFEINE = /\b(?:caffeine|cafeina|coffee|cafe|espresso)\b/;

const SUB_TRIGGER = /\b(?:instead of|in place of|alternatives? (?:to|for)|substitutes? for|swap|replace|switch|dont have|do not have|cant do|cannot do|unable to do|what can i (?:do|use)|en lugar de|en vez de|alternativa|sustituto|sustituir|reemplaz\w*|cambiar|cambia\w*|no tengo|no puedo hacer|otra opcion)\b/;
const SWAP_APPLY = /(?:swap|replace|change|switch|substitute|cambia\w*|cambiar|reemplaza\w*|sustituye\w*)\s+(?:the\s+|my\s+|el\s+|la\s+|mi\s+)?(.+?)\s+(?:for|with|to|by|por|con)\s+(?:a\s+|an\s+|the\s+|un\s+|una\s+|el\s+|la\s+)?(.+)$/;
const BORED = /\b(?:bored|boring|aburrid\w*|me aburro|aburrimiento)\b/;

const WHY = /\b(?:why (?:is|am i|do i|are|does|did you)|why this|why these|what(?:s| is) (?:the )?(?:point|purpose|reason)|what does .* (?:do|work|train)|what is .* for|por que (?:hago|esta|estoy|tengo|incluiste|hay|es)|para que (?:sirve|es)|cual es el (?:punto|proposito))\b/;

const FREQUENCY = [
  /\b(?:more|extra|another|additional)\s+(?:sets?|days?|sessions?|workouts?|exercises?|volume|reps?)\b/,
  /\b(?:train|work out|workout|lift|exercise)\s+(?:more|every day|daily|everyday|7 days|six days|5 days)\b/,
  /\b(?:add|do)\s+(?:an?\s+)?(?:extra|another)\s+(?:sets?|days?|sessions?|workouts?|exercises?)\b/,
  /\bis (?:this|that|it) (?:enough|too little|too low)\b/,
  /\benough (?:volume|training|sets|days)\b/,
  /\b(?:mas|extra) (?:series|dias|sesiones|ejercicios|volumen|repeticiones)\b/,
  /\bentrenar (?:mas|todos los dias|diario)\b/,
  /\bes suficiente\b/,
];

const VIEW_PLAN_PATTERNS: RegExp[] = [
  /\b(?:show|view|see|display|open|pull up|remind|give|send|list|muestra\w*|ver|mostrar|ensena\w*|recuerda\w*|dame|abre)\b.*\b(?:plan|workouts?|routine|program|schedule|rutina|entrenamiento\w*|programa|horario)\b/,
  /^(?:what(?:s| is)?|whats)\s+(?:my|the)\s+(?:current\s+)?(?:plan|workout|routine|program|schedule)\b/,
  /^(?:cual es|como es)\s+mi\s+(?:plan|rutina|entrenamiento|programa)\b/,
  /^(?:my\s+|mi\s+)?(?:plan|workout|routine|rutina)(?:\s+again|\s+please|\s+de nuevo|\s+por favor)?$/,
];

const CHANGE_VERBS = /\b(?:change|swap|replace|adjust|shorten|shorter|longer|skip|add|remove|delete|harder|easier|update|modify|reduce|instead|different|new plan|cambia\w*|reemplaza\w*|ajusta\w*|acorta\w*|agrega\w*|quita\w*|elimina\w*|mas dificil|mas facil|actualiza\w*|modifica\w*|diferente|nuevo plan)\b/;

function extractBodyWeightKg(text: string): number | null {
  const match = text.match(/(?:i weigh|weigh|my weight is|weight is|peso|pesa)\s*(?:about|around|unos|aproximadamente)?\s*(\d{2,3}(?:[.,]\d)?)\s*(kg|kgs|kilos?|lbs?|pounds?|libras?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const kg = /^(?:kg|kgs|kilo)/i.test(match[2]) ? value : value * 0.45359;
  return kg >= 30 && kg <= 250 ? kg : null;
}

// ---- Handlers ----------------------------------------------------------------------------------

type Handled = Stage2Decision;
const reply = (intent: Stage2Intent, message: string): Handled => ({ route: "rules", intent, response: { status: "reply", message } });
const toAi = (reason: string): Handled => ({ route: "ai", reason });

function nutritionReply(ctx: Stage2Context): Handled {
  const { normalized, language } = ctx;
  if (OUT_OF_SCOPE_NUTRITION.test(normalized)) return toAi("nutrition:out_of_scope");
  const parts: string[] = [];
  if (PROTEIN.test(normalized)) parts.push(knowledge.proteinReply(extractBodyWeightKg(ctx.text), language));
  if (mealTiming(normalized)) parts.push(knowledge.mealTimingReply(language));
  if (CREATINE.test(normalized)) parts.push(knowledge.creatineReply(language));
  if (CAFFEINE.test(normalized)) parts.push(knowledge.caffeineReply(language));
  return parts.length ? reply("nutrition", parts.join("\n\n")) : toAi("nutrition:no_template");
}

function missedReply(ctx: Stage2Context): Handled {
  let days = parseDurationDays(ctx.normalized);
  // "I missed a workout" / "missed two sessions": a day or two, not a break.
  if (days === null && /\b(?:a|an|one|two|1|2|un|una|dos)\s+(?:workouts?|sessions?|entrenamientos?|sesion(?:es)?)\b/.test(ctx.normalized)) days = 3;
  return reply("missed_workout", knowledge.missedWorkoutReply(days, ctx.language));
}

function sorenessReply(ctx: Stage2Context): Handled {
  if (SORENESS_ESCALATION.test(ctx.normalized)) return toAi("soreness:escalate_symptoms");
  const days = parseDurationDays(ctx.normalized);
  if (days !== null && days > knowledge.SORENESS.escalateAfterDays) return toAi("soreness:escalate_duration");
  return reply("soreness", knowledge.sorenessReply(ctx.language));
}

function frequencyReply(ctx: Stage2Context): Handled {
  if (!ctx.currentPlan) return toAi("missing:current_plan");
  if (ctx.currentPlan.experience_level !== "beginner") return toAi("frequency:not_beginner");
  return reply("frequency_volume", knowledge.frequencyReply(ctx.language));
}

function whyReply(ctx: Stage2Context): Handled {
  if (!ctx.currentPlan) return toAi("missing:current_plan");
  const mentioned = findMentionedPlanMove(ctx.currentPlan, ctx.normalized);
  if (!mentioned) return toAi("why:exercise_not_identified");
  const move = MOVE_LIBRARY[mentioned.key];
  const name = mentioned.exercises[0].name;
  return reply("why_exercise", knowledge.whyExerciseReply(name, move.pattern, ctx.currentPlan.goal_type, ctx.language));
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function applySwap(plan: Plan, oldKey: string, newKey: string, units: Units, language: Language): Plan {
  const taken = new Set(plan.sessions.flatMap((session) => session.exercises.map((exercise) => exercise.exercise_id)));
  const sessions = plan.sessions.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => {
      if (moveKeyOfExercise(exercise) !== oldKey) return exercise;
      const fresh = buildExerciseFromMove(newKey, plan.goal_type as BeginnerGoal, units, language);
      const id = uniqueId(fresh.exercise_id, taken);
      taken.add(id);
      // Keep the prescription the user already has; only the movement changes.
      return { ...fresh, exercise_id: id, sets: exercise.sets, rep_range: exercise.rep_range, target_rpe: exercise.target_rpe, rest_seconds: exercise.rest_seconds };
    }),
  }));
  return { ...plan, sessions };
}

function substitutionReply(ctx: Stage2Context): Handled {
  const { normalized, language, currentPlan } = ctx;
  if (BORED.test(normalized) && !SUB_TRIGGER.test(normalized)) return reply("substitution", knowledge.boredomReply(language));
  if (!currentPlan) return toAi("missing:current_plan");

  const available = planEquipment(currentPlan);
  if (!available) return toAi("substitution:unknown_equipment");

  const swap = normalized.match(SWAP_APPLY);
  const oldMove = findMentionedPlanMove(currentPlan, swap ? swap[1] : normalized);
  if (!oldMove) return toAi("substitution:exercise_not_identified");
  const old = MOVE_LIBRARY[oldMove.key];
  const oldName = oldMove.exercises[0].name;
  const options = compatibleMoves(oldMove.key, available, currentPlan);

  const newKey = swap ? findLibraryMove(swap[2]) : null;
  if (swap && newKey) {
    const target = MOVE_LIBRARY[newKey];
    const newName = target.name[language];
    if (newKey === oldMove.key) return toAi("substitution:same_exercise");
    if (target.pattern !== old.pattern) {
      return reply("substitution", knowledge.swapMismatchReply(oldName, newName, "pattern", options.map((key) => MOVE_LIBRARY[key].name[language]), language));
    }
    if (!available.has(target.equip)) {
      return reply("substitution", knowledge.swapMismatchReply(oldName, newName, "equipment", options.map((key) => MOVE_LIBRARY[key].name[language]), language));
    }
    const plan = applySwap(currentPlan, oldMove.key, newKey, ctx.units, language);
    return {
      route: "rules",
      intent: "swap_applied",
      response: {
        status: "plan_updated",
        summary: knowledge.swapAppliedSummary(oldName, newName, old.pattern, language),
        changes: [`${oldName} -> ${newName}`],
        plan,
      },
    };
  }
  if (swap) return toAi("substitution:target_unknown");

  if (options.length === 0) return toAi("substitution:no_compatible_option");
  const names = options.slice(0, 2).map((key) => MOVE_LIBRARY[key].name[language]);
  const forced = /\b(?:dont have|do not have|cant do|cannot do|unable to do|no tengo|no puedo hacer)\b/.test(normalized);
  return reply("substitution", knowledge.swapOptionsReply(oldName, names, old.pattern, language, forced));
}

// ---- Entry point ---------------------------------------------------------------------------------

export function routeStageTwo(ctx: Stage2Context): Stage2Decision {
  const n = ctx.normalized;

  const hard = TOO_HARD.test(n);
  const easy = TOO_EASY.test(n);
  const progression = PROGRESSION_PATTERNS.some((pattern) => pattern.test(n));

  const matches = new Map<string, () => Handled>();
  if (SORE.test(n)) matches.set("soreness", () => sorenessReply(ctx));
  if (MISSED_PATTERNS.some((pattern) => pattern.test(n))) matches.set("missed_workout", () => missedReply(ctx));
  if (hard && easy) return toAi("difficulty:conflicting");
  if (hard) matches.set("difficulty_feedback", () => reply("difficulty_feedback", knowledge.difficultyReply("hard", ctx.units, ctx.language)));
  if (easy) matches.set("difficulty_feedback", () => reply("difficulty_feedback", knowledge.difficultyReply("easy", ctx.units, ctx.language)));
  // "it's too easy, should I add weight?" is one question, answered by the "too easy" reply.
  if (progression && !easy) matches.set("progression_rule", () => reply("progression_rule", knowledge.progressionReply(ctx.units, ctx.language)));
  if (SUB_TRIGGER.test(n) || BORED.test(n)) matches.set("substitution", () => substitutionReply(ctx));
  if (WHY.test(n)) matches.set("why_exercise", () => whyReply(ctx));
  if (FREQUENCY.some((pattern) => pattern.test(n))) matches.set("frequency_volume", () => frequencyReply(ctx));
  if (PROTEIN.test(n) || mealTiming(n) || CREATINE.test(n) || CAFFEINE.test(n) || OUT_OF_SCOPE_NUTRITION.test(n)) matches.set("nutrition", () => nutritionReply(ctx));
  if (VIEW_PLAN_PATTERNS.some((pattern) => pattern.test(n))) {
    matches.set("view_plan", () => (ctx.currentPlan ? reply("view_plan", buildViewPlanReply(ctx.currentPlan, ctx.language)) : toAi("missing:current_plan")));
  }

  if (matches.size === 0) return toAi(CHANGE_VERBS.test(n) ? "question:requests_change" : "question:no_template");
  if (matches.size > 1) return toAi("question:multiple_intents");
  return [...matches.values()][0]();
}

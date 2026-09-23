import type { MovementPattern } from "./coachTemplates";
import type { Units } from "./coachTrainerService";

// Stage-two Coach knowledge: the ongoing coaching relationship (progression, swaps,
// difficulty, missed workouts, soreness, volume, "why this exercise", basic nutrition).
//
// Every number the router states comes from the constants below, so a change to the
// guidance is one edit here. These are general-education answers for healthy adults;
// anything touching a medical condition, medication, pain, or a minor is escalated to
// the AI pipeline before any of this text is used (see coachRouter.detectRiskSignals).

export type Language = "en" | "es";

export const PROGRESSION = {
  sessionsAtTopOfRange: 2, // hit the top of the rep range with good form this many sessions in a row
  extraRepsWeeks: 2, // ...or 2 extra reps beyond target for this many weeks straight
  extraReps: 2,
  maxJumpPercent: 10, // cap on any single load increase
} as const;

export const BEGINNER_VOLUME = {
  sessionsPerWeek: [2, 3],
  setsPerExercise: [1, 3],
  reps: [8, 12],
} as const;

export const MISSED_WORKOUTS = {
  noAdjustmentUnderDays: 7,
  easeBackFromDays: 21,
  // Assumptions layered on the guidance above (review before shipping): the size of the ease-in.
  shortBreakLoadCutPercent: 10, // 7-20 days away
  longBreakWeekOneLoadCutPercent: 20, // 3+ weeks away
  longBreakWeekTwoLoadCutPercent: 10,
} as const;

export const SORENESS = {
  peakDay: 2,
  easesByDays: [3, 4],
  escalateAfterDays: 5,
} as const;

export const NUTRITION = {
  proteinGramsPerKg: [1.6, 2.2],
  preTrainingHours: [1, 4],
  postTrainingHoursIfFasted: [2, 4], // when the pre-training meal was small, a while ago, or skipped
  creatineGramsPerDay: [3, 5],
  caffeineMaxMgPerDay: 400,
} as const;

export const NUTRITION_GENERAL_INFORMATION: Record<Language, string> = {
  en: "General information only, not personal nutrition advice.",
  es: "Información general únicamente; no es asesoramiento nutricional personal.",
};

const nutritionEducation = (text: string, language: Language) => `${text}\n\n${NUTRITION_GENERAL_INFORMATION[language]}`;

const inc = (units: Units) => (units === "kg" ? "2.5 kg" : "5 lb");

// ---- Progression -----------------------------------------------------------------

export function progressionReply(units: Units, language: Language): string {
  const example = units === "kg" ? "2.5 kg on a 25 kg lift" : "10 lb on a 100 lb lift";
  return language === "es"
    ? `Esta es la regla de progresión de tu plan. Sube el peso cuando cumplas una de dos: (1) completas todas las series en el tope del rango de repeticiones con buena técnica en ${PROGRESSION.sessionsAtTopOfRange} sesiones seguidas, o (2) puedes hacer ${PROGRESSION.extraReps} repeticiones extra sobre tu objetivo durante ${PROGRESSION.extraRepsWeeks} semanas seguidas. Luego usa el salto más pequeño disponible (unos ${inc(units)}) y nunca más de aproximadamente ${PROGRESSION.maxJumpPercent} % del peso actual en un solo paso (por ejemplo, como máximo ${example}); si el salto mínimo es mayor, añade una repetición. Cambia el peso o las repeticiones, no ambos a la vez, y mantén el peso igual después de una sesión muy pesada o con poca energía.`
    : `Here is the progression rule for your plan. Add weight once either: (1) you complete every set at the top of the rep range with good form in ${PROGRESSION.sessionsAtTopOfRange} sessions in a row, or (2) you can do ${PROGRESSION.extraReps} extra reps beyond your target for ${PROGRESSION.extraRepsWeeks} weeks straight. Then take the smallest jump available (about ${inc(units)}), and never more than about ${PROGRESSION.maxJumpPercent}% of the current weight in a single step (for example, at most ${example}); if the smallest jump is bigger than that, add a rep instead. Change weight or reps, not both at once, and keep the weight the same after a very hard or low-energy session.`;
}

// ---- Difficulty feedback -----------------------------------------------------------

export function difficultyReply(kind: "hard" | "easy", units: Units, language: Language): string {
  if (kind === "hard") {
    return language === "es"
      ? `Gracias por decírmelo, es información útil. No subas ningún peso y haz la próxima sesión más llevadera: quita una serie de cada ejercicio o baja el peso unos ${PROGRESSION.maxJumpPercent} % para terminar con 2-3 repeticiones de reserva (RPE 6-7), y descansa 90 segundos completos en los ejercicios grandes. La mayoría de los principiantes nota que las sesiones se vuelven más fáciles en 1-2 semanas. Si después de una semana sigue siendo demasiado difícil, o algo te duele o se siente raro, cuéntamelo y lo revisamos.`
      : `Thanks for telling me, that is useful. Keep your weights where they are (no increases) and make the next session easier: cut one set from each exercise or lower the weight by about ${PROGRESSION.maxJumpPercent}% so you finish with 2-3 reps left in the tank (RPE 6-7), and rest a full 90 seconds on the big lifts. Most beginners find sessions get easier within 1-2 weeks as their body adapts. If it still feels too hard after a week, or anything hurts or feels off, tell me and we will look at it.`;
  }
  return language === "es"
    ? `Buena señal: significa que te estás adaptando. No cambies nada todavía; solo revisa la regla: si completaste todas las series en el tope del rango con buena técnica en ${PROGRESSION.sessionsAtTopOfRange} sesiones seguidas, o puedes hacer ${PROGRESSION.extraReps} repeticiones extra sobre tu objetivo durante ${PROGRESSION.extraRepsWeeks} semanas seguidas, sube el salto más pequeño disponible (unos ${inc(units)}, nunca más de aproximadamente ${PROGRESSION.maxJumpPercent} %). Si no, añade una o dos repeticiones primero. Por favor no añadas series ni días extra: más no es mejor al principio, y tu plan ya te entrena lo suficiente para seguir progresando.`
    : `Good sign, it means you are adapting. Do not change anything yet, just check the rule: if you completed every set at the top of the rep range with good form in ${PROGRESSION.sessionsAtTopOfRange} sessions in a row, or can do ${PROGRESSION.extraReps} extra reps beyond target for ${PROGRESSION.extraRepsWeeks} weeks straight, add the smallest jump available (about ${inc(units)}, never more than about ${PROGRESSION.maxJumpPercent}%). If not, add a rep or two first. Please do not add extra sets or days: more is not better early on, and your plan already trains you enough to keep progressing.`;
}

// ---- Missed workouts -----------------------------------------------------------------

export function missedWorkoutReply(days: number | null, language: Language): string {
  const es = language === "es";
  const short = MISSED_WORKOUTS.shortBreakLoadCutPercent;
  const long1 = MISSED_WORKOUTS.longBreakWeekOneLoadCutPercent;
  const long2 = MISSED_WORKOUTS.longBreakWeekTwoLoadCutPercent;

  const under = es
    ? "Menos de una semana fuera: no hace falta ningún ajuste. Retoma tu plan normal con tus pesos de siempre; no dobles sesiones para \"recuperar\" las que faltaste."
    : "Under a week away: no adjustment needed. Pick up your normal plan with your usual weights, and do not double up sessions to make up for missed ones.";
  const mid = (label: string) => es
    ? `${label}: retoma el mismo plan, pero haz la primera sesión un poco más suave, con unos ${short} % menos de peso que la última vez y terminando con 3-4 repeticiones de reserva (RPE 6). Si se siente fluido, vuelve a tus pesos normales en la siguiente sesión.`
    : `${label}: resume the same plan, but make the first session a bit easier, with about ${short}% less weight than last time and 3-4 reps left in reserve (RPE 6). If it feels smooth, go back to your normal weights the next session.`;
  const long = (label: string) => es
    ? `${label}: reincorpórate poco a poco en lugar de volver a la intensidad completa. Semana 1: aproximadamente ${long1} % menos de peso, una serie menos por ejercicio y RPE 5-6. Semana 2: unos ${long2} % menos con todas las series. Semana 3: de vuelta a tu plan y a la progresión normal. La fuerza vuelve más rápido de lo que costó construirla, así que no hay prisa.`
    : `${label}: ease back in instead of resuming at full intensity. Week 1: roughly ${long1}% less weight, one fewer set per exercise, RPE 5-6. Week 2: about ${long2}% less with all sets. Week 3: back to your normal plan and progression. Strength returns faster than it was first built, so there is no rush.`;

  if (days === null) {
    return es
      ? `Cuéntame más o menos cuánto tiempo estuviste fuera y te doy el ajuste exacto. Como guía: ${under} ${mid("De 1 a 3 semanas")} ${long("Más de 3 semanas")}`
      : `Tell me roughly how long you were away and I will be specific. As a guide: ${under} ${mid("One to three weeks")} ${long("More than three weeks")}`;
  }
  if (days < MISSED_WORKOUTS.noAdjustmentUnderDays) return under;
  const weeks = Math.round(days / 7);
  if (days < MISSED_WORKOUTS.easeBackFromDays) {
    return mid(es ? `Unos ${days} días fuera` : `About ${days} days away`);
  }
  return long(es ? `Unas ${weeks} semanas fuera` : `About ${weeks} weeks away`);
}

// ---- Soreness --------------------------------------------------------------------------

export function sorenessReply(language: Language): string {
  return language === "es"
    ? `El dolor muscular leve que llega a su punto máximo alrededor del día ${SORENESS.peakDay} después de entrenar y mejora hacia el día ${SORENESS.easesByDays[0]}-${SORENESS.easesByDays[1]} es normal, sobre todo cuando eres nuevo o pruebas algo distinto; no es señal de daño. Ayudan caminar o moverte suave, dormir bien y comer suficiente proteína. Puedes seguir entrenando: si un músculo sigue adolorido, entrena alrededor de él o baja un poco el peso. Si el dolor es agudo, viene con hinchazón o dura más de ${SORENESS.escalateAfterDays} días, cuéntamelo o consulta a un profesional de salud.`
    : `Mild muscle soreness that peaks around day ${SORENESS.peakDay} after a session and eases by day ${SORENESS.easesByDays[0]}-${SORENESS.easesByDays[1]} is normal, especially when you are new or trying something different; it is not a sign of damage. Light movement like walking, good sleep, and enough protein help. You can keep training: if a muscle is still sore, train around it or lower the weight a little. If the soreness is sharp, comes with swelling, or lasts more than ${SORENESS.escalateAfterDays} days, tell me or check with a healthcare professional.`;
}

// ---- Volume / frequency -----------------------------------------------------------------

export function frequencyReply(language: Language): string {
  const [s0, s1] = BEGINNER_VOLUME.sessionsPerWeek;
  const [a0, a1] = BEGINNER_VOLUME.setsPerExercise;
  const [r0, r1] = BEGINNER_VOLUME.reps;
  return language === "es"
    ? `Para principiantes, ${s0}-${s1} sesiones por semana, ${a0}-${a1} series por ejercicio y ${r0}-${r1} repeticiones es suficiente. Con ese volumen se progresa rápido, y más no es mejor al principio: series o días extra sobre todo suman fatiga y riesgo de lesión. Mantén la constancia durante todo el bloque; si te recuperas bien y lo terminas, podemos hablar de añadir un poco.`
    : `For beginners, ${s0}-${s1} sessions a week, ${a0}-${a1} sets per exercise, and ${r0}-${r1} reps is enough. People make fast progress at that volume, and more is not better early on: extra sets or days mostly add fatigue and injury risk. Stay consistent for the whole block; if you are recovering well and finish it, we can talk about adding a little.`;
}

// ---- Swaps -------------------------------------------------------------------------------

export const KEEP_EXERCISES_NOTE: Record<Language, string> = {
  en: "Sticking with the same exercises through a block helps your coordination and confidence, so swap only when equipment or space truly forces it.",
  es: "Mantener los mismos ejercicios durante un bloque mejora tu coordinación y tu confianza, así que cambia solo cuando el equipo o el espacio realmente lo obliguen.",
};

export const PATTERN_LABEL: Record<MovementPattern, { en: string; es: string }> = {
  squat: { en: "squat pattern", es: "patrón de sentadilla" },
  lunge: { en: "single-leg (lunge) pattern", es: "patrón de una pierna (zancada)" },
  hinge: { en: "hip-hinge pattern", es: "patrón de bisagra de cadera" },
  horizontal_push: { en: "forward pressing pattern", es: "patrón de empuje horizontal" },
  vertical_push: { en: "overhead pressing pattern", es: "patrón de empuje vertical" },
  horizontal_pull: { en: "rowing pattern", es: "patrón de remo" },
  vertical_pull: { en: "pulldown pattern", es: "patrón de jalón" },
  lateral_delt: { en: "side-raise pattern", es: "patrón de elevación lateral" },
  calf: { en: "calf-raise pattern", es: "patrón de elevación de talones" },
  core_stability: { en: "core-stability pattern", es: "patrón de estabilidad del core" },
};

export function boredomReply(language: Language): string {
  return language === "es"
    ? "Es normal aburrirse, pero repetir los mismos ejercicios es justo lo que te hace mejorar: la práctica mejora tu técnica, tu coordinación y tu confianza, y así puedes progresar con seguridad. Te sugiero mantener el plan todo el bloque y ponerte metas pequeñas, como una repetición más o mejor técnica. Si de verdad necesitas cambiar algo porque no tienes el equipo o el espacio, dime qué ejercicio."
    : "Getting bored is normal, but repeating the same exercises is exactly what makes you better: practice sharpens your technique, coordination, and confidence, so you can progress safely. I suggest keeping the plan for the whole block and setting small goals, like one more rep or cleaner form. If you truly need to change something because you lack the equipment or space, tell me which exercise.";
}

// forced = the person said they cannot do it or lack the equipment; otherwise the swap
// is voluntary and we nudge them to keep the exercise for the block.
export function swapOptionsReply(exerciseName: string, options: string[], pattern: MovementPattern, language: Language, forced: boolean): string {
  const label = PATTERN_LABEL[pattern][language];
  const list = options.join(language === "es" ? " o " : " or ");
  if (forced) {
    return language === "es"
      ? `Entendido. Si no puedes hacer ${exerciseName}, la alternativa más cercana con tu equipo y el mismo ${label} es: ${list}. Dime "cambia ${exerciseName} por ..." y actualizo tu plan. Una vez que cambies, mantén el nuevo ejercicio el resto del bloque para ganar coordinación y confianza.`
      : `Understood. If you cannot do ${exerciseName}, the closest match for your equipment and the same ${label} is: ${list}. Tell me "swap ${exerciseName} for ..." and I will update your plan. Once you switch, keep the new exercise for the rest of the block so you build coordination and confidence.`;
  }
  return language === "es"
    ? `Lo mejor es mantener ${exerciseName} durante todo el bloque. ${KEEP_EXERCISES_NOTE.es} Si de verdad quieres cambiarlo, la alternativa más cercana con tu equipo y el mismo ${label} es: ${list}. Dime "cambia ${exerciseName} por ..." y lo actualizo.`
    : `The best move is to keep ${exerciseName} for the whole block. ${KEEP_EXERCISES_NOTE.en} If you do want to change it, the closest match for your equipment and the same ${label} is: ${list}. Tell me "swap ${exerciseName} for ..." and I will update your plan.`;
}

export function swapMismatchReply(oldName: string, newName: string, reason: "pattern" | "equipment", options: string[], language: Language): string {
  const list = options.join(language === "es" ? " o " : " or ");
  const why = reason === "pattern"
    ? (language === "es" ? "trabaja un patrón de movimiento distinto, así que no es un reemplazo equivalente" : "trains a different movement pattern, so it is not an equivalent swap")
    : (language === "es" ? "necesita equipo que tu plan no incluye" : "needs equipment your plan does not include");
  const tail = options.length > 0
    ? (language === "es" ? ` Opciones que sí encajan: ${list}.` : ` Options that do fit: ${list}.`)
    : "";
  return language === "es"
    ? `No cambio ${oldName} por ${newName} porque ${why}.${tail} ${KEEP_EXERCISES_NOTE.es}`
    : `I would not swap ${oldName} for ${newName} because it ${why}.${tail} ${KEEP_EXERCISES_NOTE.en}`;
}

export function swapAppliedSummary(oldName: string, newName: string, pattern: MovementPattern, language: Language): string {
  const label = PATTERN_LABEL[pattern][language];
  return language === "es"
    ? `Listo: cambié ${oldName} por ${newName}, que trabaja el mismo ${label} y encaja con tu equipo. Mantuve tus series y repeticiones. ${KEEP_EXERCISES_NOTE.es}`
    : `Done: I swapped ${oldName} for ${newName}, which trains the same ${label} and fits your equipment. I kept your sets and reps. ${KEEP_EXERCISES_NOTE.en}`;
}

// ---- Why this exercise ------------------------------------------------------------------------

const WHY_PATTERN: Record<MovementPattern, { en: string; es: string }> = {
  squat: { en: "is a squat-pattern move that trains your quads and glutes, the big muscles you use to stand up, climb stairs, and lift things", es: "es un movimiento de sentadilla que entrena tus cuádriceps y glúteos, los músculos grandes que usas para levantarte, subir escaleras y cargar cosas" },
  lunge: { en: "trains one leg at a time (quads and glutes), which builds balance and leg strength", es: "entrena una pierna a la vez (cuádriceps y glúteos), lo que mejora el equilibrio y la fuerza de piernas" },
  hinge: { en: "is a hip-hinge move for your glutes and hamstrings, the pattern you use to pick things up safely", es: "es un movimiento de bisagra de cadera para tus glúteos e isquiotibiales, el patrón que usas para levantar cosas con seguridad" },
  horizontal_push: { en: "trains your chest, shoulders, and triceps, the muscles behind every pushing motion", es: "entrena tu pecho, hombros y tríceps, los músculos detrás de todo movimiento de empuje" },
  vertical_push: { en: "trains your shoulders and triceps to press overhead", es: "entrena tus hombros y tríceps para empujar por encima de la cabeza" },
  horizontal_pull: { en: "trains your upper back and biceps, balancing all the pushing so your shoulders stay healthy", es: "entrena tu espalda alta y bíceps, equilibrando todo el empuje para que tus hombros se mantengan sanos" },
  vertical_pull: { en: "trains your lats and biceps for pulling movements", es: "entrena tus dorsales y bíceps para los movimientos de jalón" },
  lateral_delt: { en: "adds work for the side of your shoulders", es: "añade trabajo para el lateral de tus hombros" },
  calf: { en: "strengthens your calves, which help with walking, running, and balance", es: "fortalece tus pantorrillas, que ayudan al caminar, correr y mantener el equilibrio" },
  core_stability: { en: "builds core control so your trunk stays stable during the bigger lifts", es: "desarrolla control del core para que tu tronco se mantenga estable en los ejercicios grandes" },
};

const WHY_GOAL: Record<string, { en: string; es: string }> = {
  general_fitness: { en: "For general fitness, covering every major movement pattern each week keeps you balanced and capable.", es: "Para estar en forma, cubrir cada patrón de movimiento importante cada semana te mantiene equilibrado y capaz." },
  fat_loss: { en: "For fat loss, strength work like this helps you keep and build muscle while you lose fat.", es: "Para perder grasa, el trabajo de fuerza como este te ayuda a mantener y ganar músculo mientras pierdes grasa." },
  hypertrophy: { en: "For building muscle, it gives those muscles steady, repeatable work that you can load gradually.", es: "Para ganar músculo, les da a esos músculos un trabajo constante y repetible que puedes cargar poco a poco." },
  strength: { en: "For getting stronger, practicing this pattern often and adding load slowly builds both skill and strength.", es: "Para ganar fuerza, practicar este patrón con frecuencia y añadir carga poco a poco desarrolla técnica y fuerza." },
  endurance: { en: "For endurance, it builds the strength that helps you hold good form when you get tired.", es: "Para la resistencia, desarrolla la fuerza que te ayuda a mantener buena técnica cuando te cansas." },
  sport_specific: { en: "For your sport, it builds general strength you can carry over to how you move.", es: "Para tu deporte, desarrolla fuerza general que puedes trasladar a tu forma de moverte." },
};

export function whyExerciseReply(name: string, pattern: MovementPattern, goalType: string, language: Language): string {
  const goal = WHY_GOAL[goalType] ?? WHY_GOAL.general_fitness;
  return `${name} ${WHY_PATTERN[pattern][language]}. ${goal[language]}`;
}

// ---- Nutrition -----------------------------------------------------------------------------------

export function proteinReply(language: Language): string {
  const [lo, hi] = NUTRITION.proteinGramsPerKg;
  return nutritionEducation(language === "es"
    ? `Para metas enfocadas en ganar músculo, un rango educativo general es aproximadamente ${lo}-${hi} gramos de proteína por kilogramo de peso corporal al día. No se espera beneficio extra por encima de unos ${hi} g/kg. Si tienes una condición médica o tomas medicamentos, consulta primero con un profesional de salud.`
    : `For muscle-focused goals, a general educational range is about ${lo}-${hi} grams of protein per kilogram of body weight per day. No extra benefit is expected above about ${hi} g/kg. If you have a medical condition or take medication, check with a healthcare professional first.`, language);
}

export function mealTimingReply(language: Language): string {
  const [b0, b1] = NUTRITION.preTrainingHours;
  return nutritionEducation(language === "es"
    ? `Lo que más importa es cuánta proteína comes en todo el día, no el minuto exacto después de entrenar; no hay un límite real de una hora. Una guía sencilla: come proteína y carbohidratos entre ${b0} y ${b1} horas antes de entrenar y luego una comida normal con proteína en las horas siguientes. Solo si entrenas en ayunas o comiste muy poco antes, procura comer proteína dentro de ${NUTRITION.postTrainingHoursIfFasted[0]}-${NUTRITION.postTrainingHoursIfFasted[1]} horas después.`
    : `What matters most is how much protein you eat across the whole day, not the exact minute after training; there is no real one-hour cutoff. A simple guide: eat protein and carbohydrates ${b0}-${b1} hours before training, then a normal protein-containing meal sometime in the hours after. Only if you train fasted or ate very little beforehand, aim to get protein within about ${NUTRITION.postTrainingHoursIfFasted[0]}-${NUTRITION.postTrainingHoursIfFasted[1]} hours afterward.`, language);
}

export function creatineReply(language: Language): string {
  const [lo, hi] = NUTRITION.creatineGramsPerDay;
  return nutritionEducation(language === "es"
    ? `La creatina monohidratada a ${lo}-${hi} gramos al día es la dosis estándar y bien respaldada. No necesitas fase de carga; tómala todos los días a la hora que te sea fácil recordar. Se acumula en unas semanas, así que dale tiempo. Si tienes una enfermedad renal u otra condición médica, o tomas medicamentos, consúltalo antes con un profesional de salud.`
    : `Creatine monohydrate at ${lo}-${hi} grams a day is the standard, well-supported dose. You do not need a loading phase; just take it daily at any time that is easy to remember. It builds up over a few weeks, so give it time. If you have kidney disease or another medical condition, or take medication, check with a healthcare professional first.`, language);
}

export function caffeineReply(language: Language): string {
  return nutritionEducation(language === "es"
    ? `Hasta unos ${NUTRITION.caffeineMaxMgPerDay} mg de cafeína al día es la zona general de comodidad máxima para adultos sanos. Trata de evitarla después de la primera parte de la tarde para que no afecte tu sueño, que es clave para recuperarte. Si te pone nervioso o te altera el sueño, toma menos.`
    : `Up to about ${NUTRITION.caffeineMaxMgPerDay} mg of caffeine a day is the general upper comfort zone for healthy adults. Try to avoid it after early afternoon so it does not cut into your sleep, which is a big part of recovery. If it makes you jittery or disturbs your sleep, go lower.`, language);
}

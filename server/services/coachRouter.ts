import type { CoachMessage, CoachMode, CoachResponse, Plan, Units } from "./coachTrainerService";
import {
  buildBeginnerPlanResponse,
  type BeginnerEquipment,
  type BeginnerGoal,
  type Language,
} from "./coachTemplates";
import { normalizeText } from "./coachText";
import { routeStageTwo, type Stage2Intent } from "./coachIntents";

// Rules-first Coach router.
//
// Decides whether an incoming Coach request is routine and predictable enough to
// answer from templates, or needs the AI model. The bias is fail-safe: the rules
// path is taken only when every condition for it is positively met. Any injury,
// pain, health-condition, pregnancy, eating-behaviour, age, or unusual signal, and
// anything ambiguous or missing, goes to the AI pipeline (which owns safety
// judgment). Routing decisions are logged as metadata only (route, intent, reason
// code), never message content.

export type CoachRouterInput = {
  mode: CoachMode;
  units: Units;
  language: Language;
  userMessage?: string; // intake
  history?: CoachMessage[]; // intake
  question?: string; // chat
  newGoal?: string; // update_goals
  logs?: unknown; // adapt
  currentPlan?: Plan | null;
};

export type RouteDecision =
  | { route: "rules"; intent: RulesIntent; response: CoachResponse }
  | { route: "ai"; reason: string };

export type RulesIntent = "beginner_plan" | Stage2Intent;

export function isRulesRouterEnabled(): boolean {
  return (process.env.COACH_RULES_ROUTER || "on").toLowerCase() !== "off";
}

export { normalizeText };

// ---- Safety / risk detection -------------------------------------------------

const QUALIFIER = "(?:(?:known|current|any|major|health|medical|physical|previous|past|history of|recent|serious)\\s+)*";
const CONDITION_WORD =
  "(?:injur|pain|limitation|issue|problem|condition|disorder|surger|restriction|concern|lesion|dolor|limitacion|problema|condicion|molestia|enfermedad|cirugia)\\w*";
const NEGATION_LEAD = "(?:no|zero|without|not any|sin|ninguna|ningun\\w*|no tengo(?: ninguna| ningun\\w*)?)";
const NEGATED_CONDITION = new RegExp(
  `\\b${NEGATION_LEAD}\\s+(?:de\\s+)?${QUALIFIER}${CONDITION_WORD}(?:\\s+(?:de salud|medic\\w*|fisic\\w*))?(?:\\s+(?:or|and|nor|ni|y|o)\\s+${QUALIFIER}${CONDITION_WORD})*`,
  "g"
);

const RISK_PATTERNS: Array<[string, RegExp]> = [
  ["injury_pain", /\b(injur\w*|pain\w*|hurt\w*|ache\w*|aching|sprain\w*|strain\w*|torn|tear|tears|tearing|fractur\w*|broken bone|sore joint|lesion\w*|lesionad\w*|dolor\w*|duele\w*|molestia\w*|lastim\w*|esguince\w*|desgarr\w*|fractura\w*)\b/],
  ["body_part", /\b(my|mi|mis)\s+(bad\s+|weak\s+|left\s+|right\s+)?(knees?|hips?|ankles?|wrists?|elbows?|necks?|lower back|back|shoulders?|rodillas?|caderas?|tobillos?|munecas?|codos?|cuello|espalda|hombros?)\b/],
  ["surgery_rehab", /\b(surger\w*|surgical|post op|postop|stitches|rehab\w*|physical therapy|physio\w*|chiropract\w*|cirugia\w*|operad\w*|fisioterap\w*|rehabilit\w*)\b/],
  ["medical", /\b(doctor|physician|medical|medicat\w*|medicine|diagnos\w*|clearance|cleared|prescri\w*|condition|conditions|disease|disorder|syndrome|chronic|kidney\w*|renal|liver|thyroid|anemi\w*|ulcer\w*|reflux|gerd|allerg\w*|illness|ill|sick|covid|flu|infection\w*|hospital\w*|antibiotic\w*|anxiety|depress\w*|adhd|adderall|ritalin|stimulant\w*|ssri|antidepress\w*|doctora|medic\w*|medicamento\w*|diagnost\w*|enfermedad\w*|cronic\w*|rinon|rinones|higado|tiroides|alergia\w*|enferm[oa]|gripe|infeccion\w*|hospital|ansiedad|depresion)\b/],
  ["cardio_neuro", /\b(diabet\w*|blood pressure|hypertens\w*|hypotens\w*|heart|cardiac|cholesterol|dizz\w*|faint\w*|blackout|black out|passed out|asthma\w*|epilep\w*|seizure\w*|migraine\w*|numb\w*|tingl\w*|palpitat\w*|breathless|short of breath|presion arterial|hipertens\w*|corazon|cardiac\w*|mareo\w*|desmay\w*|asma|epilep\w*|convuls\w*|migran\w*|entumec\w*|hormigue\w*|falta de aire|tightness|discomfort|lightheaded|light headed|nausea|nauseous|vomit\w*|wheez\w*|pressure in my chest|chest pressure|opresion|malestar|nauseas|sin aliento|sensacion rara|presion alta|presion baja|colesterol|azucar alta|azucar en la sangre|glucosa|blood sugar|glucose|arrhythmi\w*|arritmia\w*|taquicardia|tachycardia)\b/],
  ["musculoskeletal", /\b(arthritis|osteo\w*|scoliosis|hernia\w*|herniated|sciatica|slipped disc|bulging disc|disc|tendon\w*|tendin\w*|ligament\w*|acl|mcl|meniscus|carpal|whiplash|concussion\w*|swelling|swollen|inflam\w*|limp\w*|artritis|escoliosis|ciatica|tendon|ligamento\w*|menisco|conmocion\w*|hinchaz\w*|inflamacion)\b/],
  ["pregnancy", /\b(pregnan\w*|postpartum|post partum|prenatal|breastfeed\w*|nursing mother|c section|embaraz\w*|posparto|lactancia|cesarea)\b/],
  ["eating_behavior", /\b(anorex\w*|bulimi\w*|binge\w*|purg\w*|starv\w*|eating disorder|burn off|burn it off|burn what i ate|earn my food|earn my meal|punish\w*|skip\w* meals?|crash diet|fast weight loss|lose weight fast|rapid weight loss|extreme diet|atracon\w*|castig\w*|saltarme comidas|saltar comidas|dieta extrema|bajar de peso rapido|perder peso rapido|quemar lo que comi|trastorno alimentario|obses\w*|guilt\w*|through exhaustion|to exhaustion|exhausted|lowest calories|fewest calories|as few calories|burn (?:off )?(?:everything|all|what|the calories)|detox|cleanse|two workouts (?:a|every|per) day|twice a day|culpab\w*|agotad\w*|agotamiento|calorias mas bajas|menos calorias posible|quemar (?:todo|lo que|las calorias)|saltare comidas|dejar de comer|no comer|ayuno\w*|dos entrenamientos (?:al|por|diarios)|dos veces al dia)\b/],
  ["cancer_other", /\b(cancer\w*|chemo\w*|tumor\w*|disabilit\w*|disabled|wheelchair|amputee|obes\w*|underweight|quimio\w*|discapacidad|silla de ruedas)\b/],
  ["age", /\b(elderly|senior|older adult|teen\w*|kid|kids|child|children|minor|adolescent\w*|middle school|high school|highschool|anciano\w*|tercera edad|adulto mayor|adolescente\w*|nino\w*|menor de edad|secundaria|preparatoria|colegio)\b|\b(?:my|our|for my|para mi|mi)\s+(?:\w+\s+)?(?:son|daughter|nephew|niece|hijo|hija|sobrino|sobrina)\b/],
  ["sport_goal", /\b(marathon|triathlon|powerlift\w*|bodybuild\w*|crossfit|competition|compete|competitive|athlete|athletes|sport specific|rehab|prep for|peaking|carrera|maraton|competencia|competir|atleta|culturism\w*)\b/],
];

// Two-digit ages: "I am 67", "67 years old", "tengo 67 anos".
function detectAgeRisk(normalized: string): boolean {
  const patterns = [
    /(?<![a-z0-9])(\d{2})\s*(?:years?\s*old|yrs?\s*old|yo|anos)(?![a-z0-9])/g,
    /\b(?:i am|im|aged?|soy de|tengo)\s*(\d{2})(?![a-z0-9])(?!\s*(?:days?|dias|minutes?|mins?|minutos|lbs?|kg|pounds|libras|weeks?|semanas?|times?|veces))/g,
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const age = Number(match[1]);
      if (age < 18 || age > 59) return true;
    }
  }
  return false;
}

export function detectRiskSignals(text: string): string[] {
  const normalized = normalizeText(text);
  const stripped = normalized.replace(NEGATED_CONDITION, " ");
  const found: string[] = [];
  for (const [category, pattern] of RISK_PATTERNS) {
    if (pattern.test(stripped)) found.push(category);
  }
  if (detectAgeRisk(normalized) && !found.includes("age")) found.push("age");
  // Rapid weight-loss targets ("lose 20 pounds in 3 weeks").
  const count = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)";
  if (new RegExp(`\\b(?:lose|losing|drop|perder|bajar)\\b.*\\b${count}\\s*(?:lbs?|pounds?|kg|kilos?|libras)\\b.*\\b(?:in|within|en|por)\\s+${count}\\s*(?:days?|weeks?|dias|semanas?)\\b`).test(normalized)) {
    found.push("rapid_weight_loss");
  }
  return found;
}

// ---- Intake field extraction --------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
};
const NUM = "(\\d|one|two|three|four|five|six|seven|un|uno|una|dos|tres|cuatro|cinco|seis|siete)";
const DAYS_RE = new RegExp(
  `(?<![a-z0-9])${NUM}(?:\\s+(?:to|or|a|o)\\s+${NUM})?\\s*(?:days?|times?|x|dias|veces)\\s*(?:a|per|each|every|por|de la|in a|in the)?\\s*(?:week|wk|semana)`,
  "g"
);

function toNumber(token: string): number {
  return /^\d$/.test(token) ? Number(token) : NUMBER_WORDS[token];
}

function extractDaysPerWeek(normalized: string): number | null {
  let result: number | null = null;
  for (const match of normalized.matchAll(DAYS_RE)) {
    // For a range like "3 to 4 days", take the lower number: safer for beginners.
    const first = toNumber(match[1]);
    const second = match[2] ? toNumber(match[2]) : first;
    result = Math.min(first, second);
  }
  return result;
}

function extractSessionMinutes(normalized: string): number {
  const match = normalized.match(/(?<![a-z0-9])(\d{2,3})\s*(?:min|mins|minutes|minutos)\b/);
  if (!match) return 45;
  return Math.max(25, Math.min(75, Number(match[1])));
}

const ADVANCED_MARKERS = /\b(intermediate|advanced|experienced|expert|years? of (?:lifting|training)|been (?:lifting|training) for|\d+\s*years?\s*(?:lifting|training)|intermedio|avanzado|experto|anos (?:entrenando|levantando)|de experiencia)\b/;
const BEGINNER_MARKERS = /\b(beginner|newbie|new to (?:lifting|the gym|gym|training|working out|exercise|exercising|fitness)|never (?:lifted|trained|worked out|exercised|been to)|just (?:starting|started|getting started)|first time|starting out|principiante|nuevo en|nueva en|nunca (?:he|eh)|empezando|apenas empiezo|comenzando|primera vez)\b/;

function extractGoal(normalized: string): BeginnerGoal | null {
  const goals: Array<[BeginnerGoal, RegExp]> = [
    ["fat_loss", /\b(lose (?:some )?(?:weight|fat)|fat loss|weight loss|slim(?: down)?|perder (?:peso|grasa)|bajar de peso|adelgazar)\b/],
    ["hypertrophy", /\b(build (?:some )?(?:muscle|mass)|gain (?:some )?(?:muscle|size|mass)|muscle gain|bigger|hipertrofia|ganar (?:musculo|masa)|masa muscular)\b/],
    ["strength", /\b(stronger|strength|get strong|fuerza|mas fuerte|ganar fuerza)\b/],
    ["general_fitness", /\b(general fitness|get in shape|getting in shape|be healthier|stay active|tone up|toning|overall fitness|estar en forma|ponerme en forma|ponerme fuerte y sano|condicion fisica|salud general|tonificar)\b/],
  ];
  let best: { goal: BeginnerGoal; index: number } | null = null;
  for (const [goal, pattern] of goals) {
    const match = pattern.exec(normalized);
    if (match && (best === null || match.index < best.index)) best = { goal, index: match.index };
  }
  return best?.goal ?? null;
}

function extractEquipment(normalized: string): BeginnerEquipment | "ambiguous" | null {
  const gym = /\b(gym|gimnasio|machines|maquinas|planet fitness|la fitness|anytime fitness|24 hour)\b/.test(normalized);
  const home = /\b(dumbbells?|mancuernas?)\b/.test(normalized) && /\b(home|house|casa|garage|garaje)\b/.test(normalized);
  const bodyweight = /\b(bodyweight|body weight|no equipment|without equipment|sin equipo|sin equipamiento|peso corporal|calisthenics|calistenia)\b/.test(normalized);
  const homeMention = /\b(at home|from home|en casa|home workouts?)\b/.test(normalized);
  const dumbbellsOnly = /\b(dumbbells?|mancuernas?)\b/.test(normalized);
  const other = /\b(kettlebells?|resistance bands?|bands?|barbell at home|pool|swim\w*|bike|cycling|running|yoga|pilates|trx|pesas rusas|ligas|bandas|home gym|garage gym|gimnasio en casa|gimnasio casero)\b/.test(normalized);

  const categories = [gym, home || (dumbbellsOnly && !gym), bodyweight].filter(Boolean).length;
  if (categories === 0) return homeMention ? "ambiguous" : null;
  if (categories > 1 || other) return "ambiguous";
  if (gym) return "gym";
  if (bodyweight) return "bodyweight";
  return "home_dumbbells";
}

function hasExplicitNoInjuries(normalized: string): boolean {
  return (
    normalized.match(NEGATED_CONDITION) !== null ||
    /\b(nothing hurts|feel fine|nada me duele|me siento bien de salud)\b/.test(normalized)
  );
}

const CONTEXT_PREFIX = /^CONTEXT:\s*\{[^}]*\}\s*/;

function userTextFromIntake(input: CoachRouterInput): string {
  const past = (input.history ?? [])
    .filter((message) => message.role === "user")
    .map((message) => message.content.replace(CONTEXT_PREFIX, ""));
  return [...past, (input.userMessage ?? "").replace(CONTEXT_PREFIX, "")].join(" \n ");
}

function routeIntake(input: CoachRouterInput): RouteDecision {
  const raw = userTextFromIntake(input);
  const risks = detectRiskSignals(raw);
  if (risks.length > 0) return { route: "ai", reason: `risk:${risks[0]}` };

  const normalized = normalizeText(raw);
  if (ADVANCED_MARKERS.test(normalized)) return { route: "ai", reason: "experience:not_beginner" };
  if (!BEGINNER_MARKERS.test(normalized)) return { route: "ai", reason: "missing:beginner_confirmation" };
  if (!hasExplicitNoInjuries(normalized)) return { route: "ai", reason: "missing:no_injury_confirmation" };

  const days = extractDaysPerWeek(normalized);
  if (days === null) return { route: "ai", reason: "missing:days" };
  // Beginners do well on 2-3 sessions a week; the router never pushes toward more.
  // Anything else (including a request for 4+) goes to the AI, which honors what they asked for.
  if (days < 2 || days > 3) return { route: "ai", reason: "days:out_of_range" };

  const equipment = extractEquipment(normalized);
  if (equipment === null) return { route: "ai", reason: "missing:equipment" };
  if (equipment === "ambiguous") return { route: "ai", reason: "equipment:ambiguous" };

  const goal = extractGoal(normalized);
  if (goal === null) return { route: "ai", reason: "missing:goal" };

  return {
    route: "rules",
    intent: "beginner_plan",
    response: buildBeginnerPlanResponse({
      units: input.units,
      language: input.language,
      goal,
      equipment,
      daysPerWeek: days as 2 | 3,
      sessionMinutes: extractSessionMinutes(normalized),
    }),
  };
}

// ---- Ongoing coaching (stage two): see coachIntents.ts ------------------------------

function questionText(input: CoachRouterInput): string | null {
  if (input.mode === "chat") return input.question ?? null;
  if (input.mode === "update_goals") return input.newGoal ?? null;
  if (input.mode === "adapt" && Array.isArray(input.logs) && input.logs.length === 1) {
    const log = input.logs[0] as Record<string, unknown>;
    // Only the app's free-form Coach message wrapper; structured logs go to AI.
    if (log && log.exercise_id === "general-update" && typeof log.user_note === "string") return log.user_note;
  }
  return null;
}

function routePlanQuestion(input: CoachRouterInput): RouteDecision {
  const text = questionText(input);
  if (!text) return { route: "ai", reason: "mode:not_routine" };
  if (text.length > 140) return { route: "ai", reason: "question:too_long" };

  // Injury, pain, medical condition, medication, pregnancy, minors, and eating
  // behaviour always go to the AI, before any stage-two template is considered.
  const risks = detectRiskSignals(text);
  if (risks.length > 0) return { route: "ai", reason: `risk:${risks[0]}` };

  return routeStageTwo({
    text,
    normalized: normalizeText(text),
    units: input.units,
    language: input.language,
    currentPlan: input.currentPlan ?? null,
  });
}

// ---- Entry point -----------------------------------------------------------------

export function routeCoachRequest(input: CoachRouterInput): RouteDecision {
  if (!isRulesRouterEnabled()) return { route: "ai", reason: "router:disabled" };
  try {
    return input.mode === "intake" ? routeIntake(input) : routePlanQuestion(input);
  } catch {
    // Never let a router bug block a Coach request; the AI pipeline is the fallback.
    return { route: "ai", reason: "router:error" };
  }
}

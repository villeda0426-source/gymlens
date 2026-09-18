import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import {
  buildReliableStarterPlan,
  detectReliableLanguage,
  hasCoachMedicalRedFlag,
  ReliableLanguage,
} from "../../shared/reliableCoach";

export type CoachClient = {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal; timeout?: number; maxRetries?: number }
    ) => Promise<Anthropic.Message>;
  };
};

let cachedClient: CoachClient | null = null;
let injectedClient: CoachClient | null = null;

/** Test seam: lets regressions drive the provider without network access. */
export function setCoachClientForTests(client: CoachClient | null): void {
  injectedClient = client;
}

export class CoachConfigurationError extends Error {}

function getCoachClient(): CoachClient {
  if (injectedClient) return injectedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fail immediately instead of paying for a request that cannot succeed.
    throw new CoachConfigurationError("ANTHROPIC_API_KEY is not configured on the server.");
  }

  // maxRetries: 0 keeps cost bounded; this service does its own single fallback.
  cachedClient ??= new Anthropic({ apiKey, maxRetries: 0 });
  return cachedClient;
}

export const COACH_TRAINER_MODEL =
  process.env.COACH_TRAINER_MODEL || "claude-sonnet-4-6";
const COACH_TRAINER_FALLBACK_MODEL =
  process.env.COACH_TRAINER_FALLBACK_MODEL || "claude-haiku-4-5-20251001";
const COACH_TRAINER_MAX_TOKENS = Number.parseInt(process.env.COACH_TRAINER_MAX_TOKENS || "5000", 10);
const COACH_TRAINER_PRIMARY_TIMEOUT_MS = Number.parseInt(process.env.COACH_TRAINER_PRIMARY_TIMEOUT_MS || "38000", 10);
const COACH_TRAINER_FALLBACK_TIMEOUT_MS = Number.parseInt(process.env.COACH_TRAINER_FALLBACK_TIMEOUT_MS || "17000", 10);

export const COACH_TRAINER_SYSTEM_PROMPT = `You are Coach — the AI head trainer inside SpotLift, a fitness app. You are, plainly, the best personal trainer a person could have: the caliber of coach that elite athletes, record-setting lifters, and champion physique competitors trust. You command the full body of strength & conditioning knowledge — biomechanics, progressive overload, periodization, hypertrophy and maximal-strength science, energy-system development, injury-aware programming, and exercise selection and substitution.

## YOUR STANDARD
Every program you write meets a gold standard: good enough that a panel of the world's best coaches would approve it as written, with nothing to change. You are decisive and deeply confident, because your programming is grounded in established training principles and the best available evidence. You do not hedge, you do not hand out generic filler, and you do not water plans down. You commit to specific prescriptions — exact sets, reps, loads, rest, tempo, and progression — and you stand behind them.
Confidence is not recklessness. The best coaches are also the safest: they screen for risk, respect injuries, and refer out when something falls outside a coach's scope. That judgment is part of being elite, not a contradiction of it. You never let confidence override safety.

## OUTPUT CONTRACT (read first)
- Respond with exactly ONE JSON object and NOTHING else — no markdown, no code fences, no text before or after.
- The app sets the current MODE and the user's UNITS in the incoming CONTEXT. Match your response shape to the mode (schemas below).
- Never claim the user said something they didn't. If a required detail is missing, ask for it (intake) or apply a sensible, stated default.

## UNITS
The CONTEXT includes the user's preferred unit: "kg" or "lbs". Prescribe every load in that unit and echo it in the plan's "units" field. Use unit-appropriate increments — typically 2.5 kg / 5 lbs for upper-body lifts and 5 kg / 10 lbs for lower-body lifts, scaled to the user's level. All loads the app sends back in logs are in this same unit.

## MODE: intake — the one-time setup conversation
Gather just enough to build a great first plan, then generate it. Be adaptive: short by default, deeper only when it changes the programming.
Personalized plans should guide a 21-day block, but the JSON must stay fast enough for a mobile chat request. Use timeline_weeks: 3. The sessions array must contain ONLY the first training week: exactly days_per_week sessions, capped at 4 sessions. Put week-2/week-3 progression in progression_strategy and weekly_notes rather than expanding every future session.
Essentials before you generate:
1. Primary goal (their own words)
2. Days per week they can train
3. Equipment / location (full gym, home dumbbells, bodyweight, etc.)
4. Experience level (or infer it from how they describe training)
5. Injuries, pain, or limitations
6. Preferred units — usually provided by the app; ask only if missing
Rules:
- Ask at most ~3-5 questions, batched into ONE friendly message — never one at a time.
- Infer and default the rest (session length, split, rep schemes); state key assumptions in the summary so the user can correct them.
- Don't interrogate. If the first message is already rich, go straight to plan_ready.
- Once the user has provided experience, days per week, equipment/access, injuries/limitations, and a broad goal, you MUST generate plan_ready. Do not ask follow-up questions for nice-to-have details like exact session length, favorite lifts, swimming technique, or schedule order; choose sensible defaults and mention them in the summary.
- Keep plans concise: no more than 5 exercises per session, and no more than 4 sessions in the JSON.
- SAFETY: if the user mentions chest pain, dizziness, fainting, a recent surgery, pregnancy, an uncontrolled medical condition, or anything warranting clearance — keep programming conservative and add a safety_flag recommending they consult a physician. You are a coach, not a doctor or physical therapist; don't diagnose.
- RESPONSIBLE USE: never prescribe extreme calorie restriction or unsafe rapid weight loss. If you see signs of disordered eating or an unhealthy relationship with exercise, encourage a balanced approach and suggest speaking with a professional; never reinforce it.
While still gathering:
{ "status": "gathering", "message": "<friendly question(s)>" }
When you have enough -> respond with status "plan_ready" (plan schema below).

## MODE: adapt — after the user logs workouts
The CONTEXT includes the current plan and recent logs. Read the data and adjust:
- High adherence + hitting the top of the rep range at or under target RPE -> progress load/volume per each exercise's progression_rule.
- Failed reps, RPE consistently too high, or missed targets -> hold or slightly reduce; check recovery.
- Low adherence (skipped sessions) -> simplify or reduce volume/frequency before adding anything; name the likely barrier in the summary.
- Stalled 2+ weeks -> small variation or a deload week.
Keep changes incremental and explain the "why" plainly. Respond with status "plan_updated".

## MODE: update_goals — the user changed goals or constraints
Re-shape the plan to fit the new goal (split, rep ranges, exercise selection, timeline) while preserving what's working. Respond with status "plan_updated".
Keep updated personalized plans inside the same 21-24 day planning window unless the user explicitly asks for a different duration.

## MODE: chat — a one-off question between sessions
Answer concisely and practically (form, swaps, soreness, travel, etc.):
{ "status": "reply", "message": "<answer>" }

## PLAN SCHEMA (plan_ready and plan_updated)
{
  "status": "plan_ready" | "plan_updated",
  "summary": "<warm 3-6 sentence recap: their goal, your approach, key assumptions, what to expect. For plan_updated, lead with what changed and why.>",
  "changes": ["<plan_updated only: one short bullet per adjustment>"],
  "plan": {
    "goal": "<user's goal, their words>",
    "goal_type": "strength | hypertrophy | fat_loss | endurance | general_fitness | sport_specific",
    "experience_level": "beginner | intermediate | advanced",
    "units": "kg | lbs",
    "timeline_weeks": <number>,
    "days_per_week": <number>,
    "split": "<e.g. Upper/Lower, Push/Pull/Legs, Full Body>",
    "equipment": ["<item>"],
    "constraints": ["<e.g. left knee — avoid deep loaded flexion>"],
    "progression_strategy": "<1-2 sentences on weekly advancement>",
    "sessions": [
      {
        "day_label": "<e.g. Week 1 Day 1 - Upper A>",
        "focus": "<short>",
        "estimated_minutes": <number>,
        "exercises": [
          {
            "exercise_id": "<stable-slug-id>",
            "name": "<e.g. Barbell Bench Press>",
            "category": "compound | accessory | warmup | mobility | cardio",
            "primary_muscles": ["<e.g. chest>"],
            "sets": <number>,
            "rep_range": { "min": <number>, "max": <number> },
            "target_rpe": <number or null>,
            "target_load": "<guidance in the user's units>",
            "rest_seconds": <number>,
            "tempo": "<optional, or null>",
            "progression_rule": "<how to add load/reps>",
            "substitutions": ["<alt or easier movement>"],
            "coach_notes": "<one form cue or safety note>"
          }
        ]
      }
    ],
    "weekly_notes": "<deload cadence, recovery, optional light nutrition pointer>",
    "safety_flags": ["<e.g. recommend physician clearance before starting>"]
  }
}
Keep exercise_id STABLE across revisions so the app can match history to exercises. Reuse the same id when you keep an exercise; mint a new id only for a genuinely new movement.`;

export type Units = "kg" | "lbs";
export type CoachMode = "intake" | "adapt" | "update_goals" | "chat";
export type CoachMessage = { role: "user" | "assistant"; content: string };

export type RepRange = { min: number; max: number };

export type Exercise = {
  exercise_id: string;
  name: string;
  category: "compound" | "accessory" | "warmup" | "mobility" | "cardio";
  primary_muscles: string[];
  sets: number;
  rep_range: RepRange;
  target_rpe: number | null;
  target_load: string;
  rest_seconds: number;
  tempo?: string | null;
  progression_rule: string;
  substitutions: string[];
  coach_notes: string;
};

export type Session = {
  day_label: string;
  focus: string;
  estimated_minutes: number;
  exercises: Exercise[];
};

export type Plan = {
  goal: string;
  goal_type: "strength" | "hypertrophy" | "fat_loss" | "endurance" | "general_fitness" | "sport_specific";
  experience_level: "beginner" | "intermediate" | "advanced";
  units: Units;
  timeline_weeks: number;
  days_per_week: number;
  split: string;
  equipment: string[];
  constraints: string[];
  progression_strategy: string;
  sessions: Session[];
  weekly_notes: string;
  safety_flags: string[];
};

export type CoachResponse =
  | { status: "gathering"; message: string }
  | { status: "reply"; message: string }
  | { status: "plan_ready"; summary: string; plan: Plan }
  | { status: "plan_updated"; summary: string; changes: string[]; plan: Plan };

export type CoachCallOptions = {
  primaryTimeoutMs?: number;
  fallbackTimeoutMs?: number;
  primaryModel?: string;
  maxTokens?: number;
  temperature?: number;
};

export function getCoachTimeoutsForBuild(
  buildNumber: number
): Pick<Required<CoachCallOptions>, "primaryTimeoutMs" | "fallbackTimeoutMs"> {
  if (buildNumber >= 38) {
    return { primaryTimeoutMs: 85000, fallbackTimeoutMs: 20000 };
  }

  return { primaryTimeoutMs: 30000, fallbackTimeoutMs: 12000 };
}

function context(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined);
  return `CONTEXT: ${JSON.stringify(Object.fromEntries(entries))}`;
}

export function compactPlanForCoach(plan: Plan): Plan {
  const daysPerWeek = Math.max(1, Math.min(4, Math.round(plan.days_per_week || 1)));
  return {
    ...plan,
    days_per_week: daysPerWeek,
    sessions: plan.sessions.slice(0, daysPerWeek),
  };
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1);
  }

  return withoutFence;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRepRange(value: unknown): value is RepRange {
  return isRecord(value) && isNumber(value.min) && isNumber(value.max);
}

function isExercise(value: unknown): value is Exercise {
  if (!isRecord(value)) return false;
  const categories = ["compound", "accessory", "warmup", "mobility", "cardio"];
  return (
    typeof value.exercise_id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string" &&
    categories.includes(value.category) &&
    isStringArray(value.primary_muscles) &&
    isNumber(value.sets) &&
    isRepRange(value.rep_range) &&
    (isNumber(value.target_rpe) || value.target_rpe === null) &&
    typeof value.target_load === "string" &&
    isNumber(value.rest_seconds) &&
    (typeof value.tempo === "string" || value.tempo === null || value.tempo === undefined) &&
    typeof value.progression_rule === "string" &&
    isStringArray(value.substitutions) &&
    typeof value.coach_notes === "string"
  );
}

function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    typeof value.day_label === "string" &&
    typeof value.focus === "string" &&
    isNumber(value.estimated_minutes) &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isExercise)
  );
}

export function isPlan(value: unknown): value is Plan {
  if (!isRecord(value)) return false;

  const goalTypes = ["strength", "hypertrophy", "fat_loss", "endurance", "general_fitness", "sport_specific"];
  const experienceLevels = ["beginner", "intermediate", "advanced"];

  return (
    typeof value.goal === "string" &&
    typeof value.goal_type === "string" &&
    goalTypes.includes(value.goal_type) &&
    typeof value.experience_level === "string" &&
    experienceLevels.includes(value.experience_level) &&
    (value.units === "kg" || value.units === "lbs") &&
    isNumber(value.timeline_weeks) &&
    isNumber(value.days_per_week) &&
    typeof value.split === "string" &&
    isStringArray(value.equipment) &&
    isStringArray(value.constraints) &&
    typeof value.progression_strategy === "string" &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isSession) &&
    typeof value.weekly_notes === "string" &&
    isStringArray(value.safety_flags)
  );
}

export function isCoachResponse(value: unknown): value is CoachResponse {
  if (!isRecord(value) || typeof value.status !== "string") return false;

  if (value.status === "gathering" || value.status === "reply") {
    return typeof value.message === "string";
  }

  if (value.status === "plan_ready") {
    return typeof value.summary === "string" && isPlan(value.plan);
  }

  if (value.status === "plan_updated") {
    return typeof value.summary === "string" && isStringArray(value.changes) && isPlan(value.plan);
  }

  return false;
}

function parseCoachResponse(rawText: string): CoachResponse {
  const jsonText = stripJsonFences(rawText);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    parsed = JSON.parse(jsonrepair(jsonText));
  }

  if (!isCoachResponse(parsed)) {
    throw new Error("Coach returned JSON that did not match the expected schema.");
  }

  return parsed;
}

const FALLBACK_COPY = {
  en: {
    medical:
      "Before I build a workout, stop and get medical clearance for the symptom or condition you mentioned. You can still use the rest of SpotLift while we keep training recommendations paused.",
    gathering:
      "Tell me your goal, how many days you can train, what equipment you have, your experience level, and any pain or limitations. I can build a reliable starter workout from those details even if advanced personalization is unavailable.",
    retry:
      "Coach took too long to answer cleanly. Try the same request again in a moment, or ask for a shorter adjustment.",
  },
  es: {
    medical:
      "Antes de armar un entrenamiento, detente y consigue autorización médica por el síntoma o la condición que mencionaste. Puedes seguir usando el resto de SpotLift mientras mantenemos en pausa las recomendaciones de entrenamiento.",
    gathering:
      "Cuéntame tu objetivo, cuántos días puedes entrenar, qué equipo tienes, tu nivel de experiencia y cualquier dolor o limitación. Con esos datos puedo armar un entrenamiento inicial confiable aunque la personalización avanzada no esté disponible.",
    retry:
      "Coach tardó demasiado en responder con claridad. Intenta la misma solicitud en un momento o pide un ajuste más corto.",
  },
} as const;

function fallbackIntakePlan(units: Units, rawContext: string): CoachResponse {
  // Answer in the language the conversation is already using; an English
  // fallback must never replace a Spanish starter plan the user can see.
  const language = detectReliableLanguage(rawContext);
  const copy = FALLBACK_COPY[language];

  if (hasCoachMedicalRedFlag(rawContext)) {
    return { status: "gathering", message: copy.medical };
  }

  return buildReliableStarterPlan(rawContext, units, language) ?? {
    status: "gathering",
    message: copy.gathering,
  };
}

export function fallbackCoachResponse(messages: CoachMessage[]): CoachResponse {
  const rawContext = messages.map((message) => message.content).join("\n");
  const units: Units = rawContext.includes('"units":"kg"') ? "kg" : "lbs";

  if (rawContext.includes('"mode":"intake"')) {
    return fallbackIntakePlan(units, rawContext);
  }

  return {
    status: "reply",
    message: FALLBACK_COPY[detectReliableLanguage(rawContext)].retry,
  };
}

function canUseStaticFallback(messages: CoachMessage[]): boolean {
  const rawContext = messages.map((message) => message.content).join("\n");
  return rawContext.includes('"mode":"intake"') || rawContext.includes('"mode":"chat"');
}

const RECOVERABLE_PROVIDER_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** Errors after which the deterministic plan should be served instead of an
 *  error screen: bad/late model output and provider availability failures. */
export function isCoachFallbackEligibleError(error: unknown): boolean {
  if (error instanceof CoachConfigurationError) return true;
  if (error instanceof SyntaxError) return true;
  if (!(error instanceof Error)) return false;

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && RECOVERABLE_PROVIDER_STATUSES.has(status)) return true;

  const name = error.name.toLowerCase();
  if (name.includes("abort") || name.includes("apiconnection") || name.includes("timeout")) return true;

  const message = error.message.toLowerCase();
  return (
    message.includes("expected schema") ||
    message.includes("timed out") ||
    message.includes("json") ||
    message.includes("array element") ||
    message.includes("overloaded") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("not configured")
  );
}

async function callCoach(messages: CoachMessage[], options: CoachCallOptions = {}): Promise<CoachResponse> {
  const fallbackResponse = fallbackCoachResponse(messages);
  const allowStaticFallback = canUseStaticFallback(messages);
  const primaryTimeoutMs = options.primaryTimeoutMs ?? COACH_TRAINER_PRIMARY_TIMEOUT_MS;
  const fallbackTimeoutMs = options.fallbackTimeoutMs ?? COACH_TRAINER_FALLBACK_TIMEOUT_MS;
  const primaryModel = options.primaryModel ?? COACH_TRAINER_MODEL;
  const maxTokens = options.maxTokens ?? COACH_TRAINER_MAX_TOKENS;
  const temperature = options.temperature ?? 0.5;

  async function run(nextMessages: CoachMessage[], model: string, timeoutMs: number): Promise<CoachResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await getCoachClient().messages.create(
        {
          model,
          max_tokens: Number.isFinite(maxTokens) ? maxTokens : 5000,
          temperature,
          system: COACH_TRAINER_SYSTEM_PROMPT,
          messages: nextMessages,
        },
        // Abort the paid request itself on timeout, and never let the SDK
        // retry behind our back.
        { signal: controller.signal, timeout: timeoutMs, maxRetries: 0 }
      );

      return parseCoachResponse(extractText(response));
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Coach response timed out for ${model}.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const isRecoverableFormatError = isCoachFallbackEligibleError;

  try {
    return await run(messages, primaryModel, primaryTimeoutMs);
  } catch (error) {
    if (!isRecoverableFormatError(error)) {
      throw error;
    }
    console.error("[coach-trainer] primary attempt failed:", error instanceof Error ? error.message : error);

    // Cost bound: one primary attempt plus at most one fallback attempt. A
    // malformed response is not worth re-asking the expensive model for.
    try {
      const strictMessages: CoachMessage[] = [
        ...messages,
        {
          role: "user",
          content:
            "Reply with ONE valid JSON object only, matching the schema. Keep the plan concise: 3 weeks, no more than 4 exercises per session, no markdown, no comments.",
        },
      ];
      return await run(strictMessages, COACH_TRAINER_FALLBACK_MODEL, fallbackTimeoutMs);
    } catch (fallbackError) {
      if (isRecoverableFormatError(fallbackError)) {
        console.error("[coach-trainer] fallback attempt failed:", fallbackError instanceof Error ? fallbackError.message : fallbackError);
        if (allowStaticFallback) return fallbackResponse;
      }
      throw fallbackError;
    }
  }
}

/** Exported so regressions can assert the exact payload the client produces. */
export function buildIntakeMessages(
  units: Units,
  history: CoachMessage[],
  userMessage: string,
  language?: ReliableLanguage
): CoachMessage[] {
  return history.length === 0
    ? [{ role: "user", content: `${context({ mode: "intake", units, language })}\n\n${userMessage}` }]
    : [...history, { role: "user", content: userMessage }];
}

export async function intakeTurn(
  units: Units,
  history: CoachMessage[],
  userMessage: string,
  options?: CoachCallOptions,
  language?: ReliableLanguage
): Promise<CoachResponse> {
  return callCoach(buildIntakeMessages(units, history, userMessage, language), options);
}

export async function adaptPlan(
  units: Units,
  currentPlan: Plan,
  logs: unknown,
  options?: CoachCallOptions,
  language?: ReliableLanguage
): Promise<CoachResponse> {
  return callCoach([
    {
      role: "user",
      content: context({ mode: "adapt", units, language, current_plan: compactPlanForCoach(currentPlan), logs }),
    },
  ], options);
}

export async function updateGoals(
  units: Units,
  currentPlan: Plan,
  newGoal: string,
  options?: CoachCallOptions,
  language?: ReliableLanguage
): Promise<CoachResponse> {
  return callCoach([
    {
      role: "user",
      content: context({
        mode: "update_goals",
        units,
        language,
        current_plan: compactPlanForCoach(currentPlan),
        new_goal: newGoal,
      }),
    },
  ], options);
}

export async function chatWithCoach(
  units: Units,
  question: string,
  currentPlan?: Plan | null,
  options?: CoachCallOptions,
  language?: ReliableLanguage
): Promise<CoachResponse> {
  return callCoach([
    {
      role: "user",
      content: context({
        mode: "chat",
        units,
        language,
        question,
        current_plan: currentPlan ? compactPlanForCoach(currentPlan) : null,
      }),
    },
  ], options);
}

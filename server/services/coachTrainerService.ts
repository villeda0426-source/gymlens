import { jsonrepair } from "jsonrepair";
import { createTextResponse } from "./openaiService";

export const COACH_TRAINER_MODEL =
  process.env.OPENAI_COACH_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";
const COACH_TRAINER_FALLBACK_MODEL =
  process.env.OPENAI_FALLBACK_MODEL || "gpt-5-nano";
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

## LANGUAGE
The CONTEXT includes language: "en" or "es". Write every user-facing string in that language, including messages, summaries, changes, plan goals, session labels, focus areas, exercise names, muscle names, equipment, constraints, progression instructions, substitutions, coaching notes, weekly notes, and safety flags. Keep JSON property names and enum values exactly as defined by the schema. For Spanish, use natural neutral Latin American Spanish and retain established exercise names when translating them would be unclear.

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
- If latest_feedback.planComplete is true, the athlete finished the entire training block. Review the compact summary and final feedback, then create the next complete 21-day progression block. Preserve successful exercise IDs where appropriate, progress conservatively, and clearly name the new block in the summary and changes.
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
};

function context(obj: Record<string, unknown>): string {
  return `CONTEXT: ${JSON.stringify(obj)}`;
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

function enforcePlanGuardrails(response: CoachResponse, previousPlan?: Plan): CoachResponse {
  if (response.status !== "plan_ready" && response.status !== "plan_updated") return response;
  const previousById = new Map(
    previousPlan?.sessions.flatMap((session) => session.exercises).map((exercise) => [exercise.exercise_id, exercise]) ?? []
  );
  let adjusted = false;
  const sessions = response.plan.sessions.slice(0, 6).map((session) => ({
    ...session,
    estimated_minutes: Math.max(10, Math.min(120, Math.round(session.estimated_minutes))),
    exercises: session.exercises.slice(0, 6).map((exercise) => {
      const previous = previousById.get(exercise.exercise_id);
      const maxSets = previous ? Math.max(1, previous.sets + 1) : 6;
      const sets = Math.max(1, Math.min(maxSets, Math.round(exercise.sets)));
      const minRep = Math.max(1, Math.min(50, Math.round(exercise.rep_range.min)));
      const maxRep = Math.max(minRep, Math.min(50, Math.round(exercise.rep_range.max)));
      const targetRpe = exercise.target_rpe === null
        ? null
        : Math.max(5, Math.min(10, exercise.target_rpe));
      const restSeconds = Math.max(0, Math.min(600, Math.round(exercise.rest_seconds)));
      if (sets !== exercise.sets || minRep !== exercise.rep_range.min || maxRep !== exercise.rep_range.max || targetRpe !== exercise.target_rpe || restSeconds !== exercise.rest_seconds) adjusted = true;
      return { ...exercise, sets, rep_range: { min: minRep, max: maxRep }, target_rpe: targetRpe, rest_seconds: restSeconds };
    }),
  }));
  const plan = {
    ...response.plan,
    days_per_week: Math.max(1, Math.min(6, Math.round(response.plan.days_per_week))),
    timeline_weeks: Math.max(1, Math.min(12, Math.round(response.plan.timeline_weeks))),
    sessions,
  };
  if (response.status === "plan_updated") {
    return {
      ...response,
      plan,
      changes: adjusted
        ? [...response.changes, "SpotLift capped the change within its progression and safety limits."]
        : response.changes,
    };
  }
  return { ...response, plan };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function makeExercise(
  name: string,
  category: Exercise["category"],
  primaryMuscles: string[],
  sets: number,
  minReps: number,
  maxReps: number,
  targetRpe: number | null,
  targetLoad: string,
  restSeconds: number,
  coachNotes: string
): Exercise {
  return {
    exercise_id: slugify(name),
    name,
    category,
    primary_muscles: primaryMuscles,
    sets,
    rep_range: { min: minReps, max: maxReps },
    target_rpe: targetRpe,
    target_load: targetLoad,
    rest_seconds: restSeconds,
    tempo: null,
    progression_rule: "When all sets hit the top of the rep range at or below target RPE, add 5 lb next time.",
    substitutions: ["Machine variation", "Dumbbell variation"],
    coach_notes: coachNotes,
  };
}

function fallbackIntakePlan(units: Units, rawContext: string): CoachResponse {
  const wantsFourDays = /4\s*day|four\s*day|3-4|3 to 4/i.test(rawContext);
  const daysPerWeek = wantsFourDays ? 4 : 3;
  const load = units === "kg" ? "Use a controlled load with 2.5 kg jumps available." : "Use a controlled load with 5 lb jumps available.";

  const sessions: Session[] = [
    {
      day_label: "Week 1 Day 1 - Push Strength",
      focus: "Chest, shoulders, triceps",
      estimated_minutes: 60,
      exercises: [
        makeExercise("Barbell Bench Press", "compound", ["chest", "triceps", "shoulders"], 4, 4, 6, 8, load, 150, "Shoulder blades pinned; drive evenly through both feet."),
        makeExercise("Incline Dumbbell Press", "compound", ["chest", "shoulders"], 3, 8, 10, 8, load, 90, "Lower under control and stop just short of shoulder discomfort."),
        makeExercise("Seated Dumbbell Shoulder Press", "compound", ["shoulders", "triceps"], 3, 6, 8, 8, load, 120, "Keep ribs down and avoid leaning back."),
        makeExercise("Cable Triceps Pressdown", "accessory", ["triceps"], 3, 10, 14, 8, load, 60, "Lock elbows by your sides and finish each rep fully."),
      ],
    },
    {
      day_label: "Week 1 Day 2 - Lower Strength + Easy Swim",
      focus: "Leg strength and pool technique",
      estimated_minutes: 70,
      exercises: [
        makeExercise("Back Squat", "compound", ["quads", "glutes", "core"], 4, 4, 6, 8, load, 180, "Brace hard before every rep and keep depth consistent."),
        makeExercise("Romanian Deadlift", "compound", ["hamstrings", "glutes", "back"], 3, 6, 8, 8, load, 150, "Hinge until hamstrings load; keep the bar close."),
        makeExercise("Walking Lunge", "accessory", ["quads", "glutes"], 3, 8, 10, 8, load, 90, "Smooth steps, tall torso, full-foot pressure."),
        makeExercise("Technique Swim", "cardio", ["core"], 1, 20, 25, null, "25m pool: easy repeats, nasal/exhale focus, no race pace.", 30, "Leave the pool feeling sharper, not crushed."),
      ],
    },
    {
      day_label: "Week 1 Day 3 - Pull Strength",
      focus: "Back, biceps, posterior chain",
      estimated_minutes: 60,
      exercises: [
        makeExercise("Pull-Up or Assisted Pull-Up", "compound", ["back", "biceps"], 4, 5, 8, 8, load, 120, "Start each rep by pulling shoulders down, then elbows."),
        makeExercise("Barbell Row", "compound", ["back", "biceps"], 4, 6, 8, 8, load, 150, "Keep torso locked and row toward lower ribs."),
        makeExercise("Lat Pulldown", "accessory", ["back", "biceps"], 3, 8, 12, 8, load, 90, "Pause briefly with elbows tight to your sides."),
        makeExercise("Dumbbell Curl", "accessory", ["biceps"], 3, 10, 12, 8, load, 60, "No swinging; own the lowering phase."),
      ],
    },
    {
      day_label: "Week 1 Day 4 - Conditioning + Arms",
      focus: "Engine, swim weakness, arms",
      estimated_minutes: 65,
      exercises: [
        makeExercise("Zone 2 Bike", "cardio", ["quads", "calves"], 1, 25, 35, null, "Conversational pace.", 0, "Steady breathing; this should build capacity, not bury you."),
        makeExercise("Swim Intervals", "cardio", ["core", "shoulders"], 1, 12, 16, null, "25m pool: 8-12 x 25m controlled repeats.", 30, "Prioritize relaxed breathing and clean turns."),
        makeExercise("Cable Lateral Raise", "accessory", ["shoulders"], 3, 12, 15, 8, load, 45, "Lead with elbows and keep traps quiet."),
        makeExercise("Superset: Rope Curl + Overhead Triceps Extension", "accessory", ["biceps", "triceps"], 3, 10, 14, 8, load, 45, "Smooth reps; chase tension, not momentum."),
      ],
    },
  ].slice(0, daysPerWeek);

  return {
    status: "plan_ready",
    summary:
      "You gave enough detail to start: early-intermediate training age, full gym and pool access, no injuries, a 4-day preference, and a goal of getting stronger while improving conditioning and swimming. I built week 1 as a push/lower/pull/conditioning split with swimming practice baked in. Run this first week, then repeat the structure for weeks 2 and 3 with small load or rep progressions.",
    plan: {
      goal: "Get stronger while improving conditioning and swimming",
      goal_type: "general_fitness",
      experience_level: "intermediate",
      units,
      timeline_weeks: 3,
      days_per_week: daysPerWeek,
      split: daysPerWeek === 4 ? "Push / Lower / Pull / Conditioning" : "Push / Pull / Lower + Conditioning",
      equipment: ["Full gym", "25m pool", "bike"],
      constraints: ["No reported injuries", "Swimming is the main conditioning weakness"],
      progression_strategy:
        "Weeks 2 and 3 repeat the same split. Add 5 lb or 1-2 reps when sets land at the top of the range at RPE 8 or lower; keep swim work technique-first and add 1-2 intervals per week.",
      sessions,
      weekly_notes:
        "Place at least one rest or easy day after lower body. Keep endurance work mostly conversational so strength can progress. If fatigue spikes, hold loads steady and reduce swim intervals by 20%.",
      safety_flags: [],
    },
  };
}

function fallbackCoachResponse(messages: CoachMessage[]): CoachResponse {
  const rawContext = messages.map((message) => message.content).join("\n");
  const units: Units = rawContext.includes('"units":"kg"') ? "kg" : "lbs";

  if (rawContext.includes('"mode":"intake"')) {
    return fallbackIntakePlan(units, rawContext);
  }

  return {
    status: "reply",
    message:
      "Coach took too long to answer cleanly. Try the same request again in a moment, or ask for a shorter adjustment.",
  };
}

async function callCoach(messages: CoachMessage[], options: CoachCallOptions = {}): Promise<CoachResponse> {
  const fallbackResponse = fallbackCoachResponse(messages);
  const primaryTimeoutMs = options.primaryTimeoutMs ?? COACH_TRAINER_PRIMARY_TIMEOUT_MS;
  const fallbackTimeoutMs = options.fallbackTimeoutMs ?? COACH_TRAINER_FALLBACK_TIMEOUT_MS;

  async function run(nextMessages: CoachMessage[], model: string, timeoutMs: number): Promise<CoachResponse> {
    const text = await createTextResponse({
      model,
      instructions: COACH_TRAINER_SYSTEM_PROMPT,
      input: nextMessages,
      maxOutputTokens: Number.isFinite(COACH_TRAINER_MAX_TOKENS) ? COACH_TRAINER_MAX_TOKENS : 5000,
      timeoutMs,
      telemetryFeature: "coach_trainer",
    });

    return parseCoachResponse(text);
  }

  const isRecoverableFormatError = (error: unknown) =>
    error instanceof SyntaxError ||
    (error instanceof Error &&
      (error.message.includes("expected schema") ||
        error.message.includes("timed out") ||
        error.message.toLowerCase().includes("json") ||
        error.message.toLowerCase().includes("array element")));

  try {
    return await run(messages, COACH_TRAINER_MODEL, primaryTimeoutMs);
  } catch (error) {
    if (!isRecoverableFormatError(error)) {
      throw error;
    }

    if (error instanceof Error && error.message.includes("timed out")) {
      console.error("[coach-trainer] primary response timed out:", error.message);
      try {
        return await run(messages, COACH_TRAINER_FALLBACK_MODEL, fallbackTimeoutMs);
      } catch (fallbackError) {
        if (isRecoverableFormatError(fallbackError)) {
          console.error("[coach-trainer] fallback response failed:", fallbackError);
          return fallbackResponse;
        }
        throw fallbackError;
      }
    }

    try {
      return await run([
      ...messages,
      {
        role: "user",
        content:
            "Your previous response was not valid JSON for the schema. Reply again with ONE valid JSON object only. Keep the plan concise: 3 weeks, no more than 4 exercises per session, no markdown, no comments.",
      },
      ], COACH_TRAINER_MODEL, primaryTimeoutMs);
    } catch (retryError) {
      if (isRecoverableFormatError(retryError)) {
        console.error("[coach-trainer] primary JSON formatting failed after retry:", retryError);
        try {
          return await run(messages, COACH_TRAINER_FALLBACK_MODEL, fallbackTimeoutMs);
        } catch (fallbackError) {
          if (isRecoverableFormatError(fallbackError)) {
            console.error("[coach-trainer] fallback response failed:", fallbackError);
            return fallbackResponse;
          }
          throw fallbackError;
        }
      }
      throw retryError;
    }
  }
}

export async function intakeTurn(
  units: Units,
  history: CoachMessage[],
  userMessage: string,
  language: "en" | "es" = "en",
  options?: CoachCallOptions
): Promise<CoachResponse> {
  const messages: CoachMessage[] =
    history.length === 0
      ? [{ role: "user", content: `${context({ mode: "intake", units, language })}\n\n${userMessage}` }]
      : [...history, { role: "user", content: userMessage }];

  return enforcePlanGuardrails(await callCoach(messages, options));
}

export async function adaptPlan(
  units: Units,
  currentPlan: Plan,
  logs: unknown,
  language: "en" | "es" = "en",
  options?: CoachCallOptions
): Promise<CoachResponse> {
  return enforcePlanGuardrails(await callCoach([
    {
      role: "user",
      content: context({ mode: "adapt", units, language, current_plan: currentPlan, logs }),
    },
  ], options), currentPlan);
}

export async function updateGoals(
  units: Units,
  currentPlan: Plan,
  newGoal: string,
  language: "en" | "es" = "en",
  options?: CoachCallOptions
): Promise<CoachResponse> {
  return enforcePlanGuardrails(await callCoach([
    {
      role: "user",
      content: context({ mode: "update_goals", units, language, current_plan: currentPlan, new_goal: newGoal }),
    },
  ], options), currentPlan);
}

export async function chatWithCoach(
  units: Units,
  question: string,
  currentPlan?: Plan | null,
  language: "en" | "es" = "en",
  options?: CoachCallOptions
): Promise<CoachResponse> {
  return callCoach([
    {
      role: "user",
      content: context({ mode: "chat", units, language, question, current_plan: currentPlan ?? null }),
    },
  ], options);
}

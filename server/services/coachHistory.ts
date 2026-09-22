import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachResponse, Plan } from "./coachTrainerService";
import type { RulesIntent } from "./coachRouter";

// Account context deliberately contains only the minimum metadata needed for
// routing. In particular, limitation details and any Coach message text never
// leave the database loader or enter router logs / provider prompts.

export type CoachAgeBand = "unknown" | "under_18" | "adult_18_59" | "over_59";

export type CoachProfileHistory = {
  preferredLanguage: "en" | "es" | null;
  preferredUnits: "kg" | "lb" | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | null;
  goal: string | null;
  equipmentType: string | null;
  daysPerWeek: number | null;
  ageBand: CoachAgeBand;
  safetyReviewedAt: string | null;
};

export type CoachEventHistory = {
  eventType: string;
  routeReason: string | null;
  createdAt: string;
};

export type CoachHistoryContext = {
  profile: CoachProfileHistory | null;
  activeLimitationTypes: string[];
  recentEvents: CoachEventHistory[];
  loadError: boolean;
};

export const COACH_HISTORY_POLICY = {
  safetyReviewStaleAfterDays: 365,
  recentCautiousEventDays: 7,
  recentEventsLimit: 12,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function isLanguage(value: unknown): value is "en" | "es" {
  return value === "en" || value === "es";
}

function isAgeBand(value: unknown): value is CoachAgeBand {
  return value === "unknown" || value === "under_18" || value === "adult_18_59" || value === "over_59";
}

function emptyHistory(loadError: boolean): CoachHistoryContext {
  return { profile: null, activeLimitationTypes: [], recentEvents: [], loadError };
}

/**
 * Loads only an authenticated user's routing metadata. This uses the service
 * client, so every user-owned query includes an explicit user-id predicate.
 * A query failure intentionally becomes a cautious AI route rather than a
 * partial or optimistic rules decision.
 */
export async function loadCoachHistory(
  client: SupabaseClient,
  userId: string
): Promise<CoachHistoryContext> {
  try {
    const [profileResult, limitationsResult, eventsResult] = await Promise.all([
      client
        .from("profiles")
        .select("id, preferred_language, preferred_units, experience_level, goal, equipment_type, days_per_week, age_band, safety_reviewed_at")
        .eq("id", userId)
        .maybeSingle(),
      client
        .from("user_limitations")
        .select("limitation_type")
        .eq("user_id", userId)
        .eq("active", true),
      client
        .from("coach_events")
        .select("event_type, route_reason, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(COACH_HISTORY_POLICY.recentEventsLimit),
    ]);

    if (profileResult.error || limitationsResult.error || eventsResult.error) {
      return emptyHistory(true);
    }

    const row = profileResult.data as Record<string, unknown> | null;
    const profile: CoachProfileHistory | null = row
      ? {
          preferredLanguage: isLanguage(row.preferred_language) ? row.preferred_language : null,
          preferredUnits: row.preferred_units === "kg" || row.preferred_units === "lb" ? row.preferred_units : null,
          experienceLevel:
            row.experience_level === "beginner" || row.experience_level === "intermediate" || row.experience_level === "advanced"
              ? row.experience_level
              : null,
          goal: typeof row.goal === "string" && row.goal.trim() ? row.goal.trim() : null,
          equipmentType: typeof row.equipment_type === "string" && row.equipment_type.trim() ? row.equipment_type.trim() : null,
          daysPerWeek: typeof row.days_per_week === "number" && Number.isFinite(row.days_per_week) ? row.days_per_week : null,
          ageBand: isAgeBand(row.age_band) ? row.age_band : "unknown",
          safetyReviewedAt: typeof row.safety_reviewed_at === "string" ? row.safety_reviewed_at : null,
        }
      : null;

    const activeLimitationTypes = (limitationsResult.data ?? [])
      .map((item) => (item as Record<string, unknown>).limitation_type)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .slice(0, 8);

    const recentEvents = (eventsResult.data ?? [])
      .map((item): CoachEventHistory | null => {
        const row = item as Record<string, unknown>;
        return typeof row.event_type === "string" && typeof row.created_at === "string"
          ? {
              eventType: row.event_type,
              routeReason: typeof row.route_reason === "string" ? row.route_reason : null,
              createdAt: row.created_at,
            }
          : null;
      })
      .filter((event): event is CoachEventHistory => event !== null);

    return { profile, activeLimitationTypes, recentEvents, loadError: false };
  } catch {
    return emptyHistory(true);
  }
}

export function isSafetyReviewStale(value: string | null, now = Date.now()): boolean {
  if (!value) return true;
  const reviewed = Date.parse(value);
  return !Number.isFinite(reviewed) || now - reviewed > COACH_HISTORY_POLICY.safetyReviewStaleAfterDays * DAY_MS;
}

/**
 * Return the first monotonic safety gate. None of these gates can ever turn an
 * AI decision into a rules decision; they only force the safer path.
 */
export function historyRouteReason(context: CoachHistoryContext, now = Date.now()): string | null {
  if (context.loadError) return "history:unavailable";
  if (!context.profile) return "history:missing_profile";
  if (context.profile.ageBand === "unknown") return "history:age_gate_unconfirmed";
  if (context.profile.ageBand === "under_18") return "history:under_18";
  if (context.profile.ageBand === "over_59") return "history:over_59";
  if (isSafetyReviewStale(context.profile.safetyReviewedAt, now)) return "history:stale_safety_review";
  if (context.activeLimitationTypes.length > 0) return "history:active_limitation";

  const cautiousSince = now - COACH_HISTORY_POLICY.recentCautiousEventDays * DAY_MS;
  if (context.recentEvents.some((event) => event.eventType === "soreness_reported" && Date.parse(event.createdAt) >= cautiousSince)) {
    return "history:recent_soreness";
  }
  return null;
}

export type CoachEventInput = {
  eventType:
    | "rules_response"
    | "difficulty_easy"
    | "difficulty_hard"
    | "missed_workout"
    | "soreness_reported"
    | "substitution_requested"
    | "plan_generated"
    | "response_flagged_unhelpful";
  routeReason: string;
  responseId?: string;
  metadata?: Record<string, boolean | number | string | null>;
};

const MAX_ROUTE_REASON_LENGTH = 96;
const MAX_RESPONSE_ID_LENGTH = 80;

function safeEventMetadata(value: CoachEventInput["metadata"]): Record<string, boolean | number | string | null> {
  if (!value) return {};
  const out: Record<string, boolean | number | string | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]{0,40}$/.test(key)) continue;
    if (typeof entry === "string") {
      // Metadata never receives user text. Keep the remaining small code-like
      // values bounded even if a caller is changed later.
      if (entry.length <= 80 && /^[a-zA-Z0-9_.:-]+$/.test(entry)) out[key] = entry;
    } else if (typeof entry === "number" ? Number.isFinite(entry) : typeof entry === "boolean" || entry === null) {
      out[key] = entry;
    }
  }
  return out;
}

export async function recordCoachEvent(
  client: SupabaseClient,
  userId: string,
  event: CoachEventInput
): Promise<void> {
  const routeReason = event.routeReason.slice(0, MAX_ROUTE_REASON_LENGTH);
  const responseId = event.responseId?.slice(0, MAX_RESPONSE_ID_LENGTH) ?? null;
  const { error } = await client.from("coach_events").insert({
    user_id: userId,
    event_type: event.eventType,
    route_reason: routeReason,
    response_id: responseId,
    metadata: safeEventMetadata(event.metadata),
  });
  if (error) throw error;
}

export function coachEventForRule(intent: RulesIntent, routeReason: string): CoachEventInput {
  const eventType: CoachEventInput["eventType"] =
    intent === "difficulty_feedback"
      ? "difficulty_easy"
      : intent === "missed_workout"
        ? "missed_workout"
        : intent === "soreness"
          ? "soreness_reported"
          : intent === "substitution" || intent === "swap_applied"
            ? "substitution_requested"
            : intent === "beginner_plan"
              ? "plan_generated"
              : "rules_response";
  return { eventType, routeReason, metadata: { rulesHandled: true, intent } };
}

/** Persist a prescription, never the surrounding Coach response text. */
export async function persistCoachPlan(
  client: SupabaseClient,
  userId: string,
  plan: Plan,
  source: "rules" | "ai"
): Promise<void> {
  const { data: program, error: programError } = await client
    .from("programs")
    .insert({
      user_id: userId,
      source,
      goal: plan.goal,
      goal_type: plan.goal_type,
      experience_level: plan.experience_level,
      units: plan.units,
      timeline_weeks: plan.timeline_weeks,
      days_per_week: plan.days_per_week,
      split: plan.split,
      equipment: plan.equipment,
      progression_strategy: plan.progression_strategy,
    })
    .select("id")
    .single();
  if (programError || !program) throw programError || new Error("Program insert returned no id.");

  const sessions = plan.sessions.map((session, position) => ({
    program_id: program.id,
    user_id: userId,
    position,
    day_label: session.day_label,
    focus: session.focus,
    estimated_minutes: session.estimated_minutes,
  }));
  const { data: savedSessions, error: sessionsError } = await client
    .from("plan_sessions")
    .insert(sessions)
    .select("id, position");
  if (sessionsError || !savedSessions) throw sessionsError || new Error("Plan session insert returned no rows.");

  const sessionIdByPosition = new Map<number, string>(
    savedSessions.map((session) => [Number((session as Record<string, unknown>).position), String((session as Record<string, unknown>).id)])
  );
  const exercises = plan.sessions.flatMap((session, sessionPosition) =>
    session.exercises.map((exercise, position) => ({
      program_id: program.id,
      plan_session_id: sessionIdByPosition.get(sessionPosition),
      user_id: userId,
      exercise_id: exercise.exercise_id,
      exercise_name: exercise.name,
      position,
      primary_muscles: exercise.primary_muscles,
      sets: exercise.sets,
      rep_min: exercise.rep_range.min,
      rep_max: exercise.rep_range.max,
      target_rpe: exercise.target_rpe,
      target_load: exercise.target_load,
      rest_seconds: exercise.rest_seconds,
    }))
  );
  if (exercises.some((exercise) => !exercise.plan_session_id)) {
    throw new Error("Plan session rows could not be associated with exercises.");
  }
  const { error: exercisesError } = await client.from("plan_exercises").insert(exercises);
  if (exercisesError) throw exercisesError;
}

export function responseHasPlan(response: CoachResponse): response is Extract<CoachResponse, { status: "plan_ready" | "plan_updated" }> {
  return response.status === "plan_ready" || response.status === "plan_updated";
}

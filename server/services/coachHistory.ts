import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoachResponse, Plan } from "./coachTrainerService";
import type { RulesIntent } from "./coachRouter";

// This is intentionally a metadata-only boundary. Limitation details and Coach
// messages never enter the router, provider context, event ledger, or logs.
export type CoachHistoryContext = {
  profile: {
    experienceLevel: "beginner" | "intermediate" | "advanced" | null;
    goal: string | null;
    equipmentType: string | null;
    daysPerWeek: number | null;
    ageBand: "unknown" | "under_18" | "adult_18_59" | "over_59";
    safetyReviewedAt: string | null;
  } | null;
  activeLimitationTypes: string[];
  recentEvents: Array<{ eventType: string; routeReason: string | null; createdAt: string }>;
  loadError: boolean;
};

export const COACH_HISTORY_POLICY = {
  safetyReviewStaleAfterDays: 365,
  recentSorenessDays: 7,
  recentEventLimit: 12,
} as const;

const DAY_MS = 86_400_000;
const emptyHistory = (loadError: boolean): CoachHistoryContext => ({
  profile: null, activeLimitationTypes: [], recentEvents: [], loadError,
});

export async function loadCoachHistory(client: SupabaseClient, userId: string): Promise<CoachHistoryContext> {
  try {
    const [profileResult, limitationsResult, eventsResult] = await Promise.all([
      client.from("profiles")
        .select("id, experience_level, goal, equipment_type, days_per_week, age_band, safety_reviewed_at")
        .eq("id", userId).maybeSingle(),
      client.from("user_limitations").select("limitation_type").eq("user_id", userId).eq("active", true),
      client.from("coach_events").select("event_type, route_reason, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(COACH_HISTORY_POLICY.recentEventLimit),
    ]);
    if (profileResult.error || limitationsResult.error || eventsResult.error) return emptyHistory(true);

    const profileRow = profileResult.data as any;
    const validAge = ["unknown", "under_18", "adult_18_59", "over_59"];
    const validExperience = ["beginner", "intermediate", "advanced"];
    return {
      profile: profileRow ? {
        experienceLevel: validExperience.includes(profileRow.experience_level) ? profileRow.experience_level : null,
        goal: typeof profileRow.goal === "string" ? profileRow.goal : null,
        equipmentType: typeof profileRow.equipment_type === "string" ? profileRow.equipment_type : null,
        daysPerWeek: typeof profileRow.days_per_week === "number" ? profileRow.days_per_week : null,
        ageBand: validAge.includes(profileRow.age_band) ? profileRow.age_band : "unknown",
        safetyReviewedAt: typeof profileRow.safety_reviewed_at === "string" ? profileRow.safety_reviewed_at : null,
      } : null,
      activeLimitationTypes: (limitationsResult.data ?? []).map((row: any) => row.limitation_type).filter((v: unknown): v is string => typeof v === "string").slice(0, 8),
      recentEvents: (eventsResult.data ?? []).flatMap((row: any) =>
        typeof row.event_type === "string" && typeof row.created_at === "string"
          ? [{ eventType: row.event_type, routeReason: typeof row.route_reason === "string" ? row.route_reason : null, createdAt: row.created_at }]
          : []),
      loadError: false,
    };
  } catch {
    return emptyHistory(true);
  }
}

export function historyRouteReason(history: CoachHistoryContext, now = Date.now()): string | null {
  if (history.loadError) return "history:unavailable";
  if (!history.profile) return "history:missing_profile";
  if (history.profile.ageBand === "unknown") return "history:age_gate_unconfirmed";
  if (history.profile.ageBand === "under_18") return "history:under_18";
  if (history.profile.ageBand === "over_59") return "history:over_59";
  const reviewedAt = history.profile.safetyReviewedAt ? Date.parse(history.profile.safetyReviewedAt) : NaN;
  if (!Number.isFinite(reviewedAt) || now - reviewedAt > COACH_HISTORY_POLICY.safetyReviewStaleAfterDays * DAY_MS) return "history:stale_safety_review";
  if (history.activeLimitationTypes.length) return "history:active_limitation";
  if (history.recentEvents.some((event) => event.eventType === "soreness_reported" && Date.parse(event.createdAt) >= now - COACH_HISTORY_POLICY.recentSorenessDays * DAY_MS)) {
    return "history:recent_soreness";
  }
  return null;
}

type CoachEventType = "rules_response" | "difficulty_easy" | "difficulty_hard" | "missed_workout" | "soreness_reported" | "substitution_requested" | "plan_generated" | "response_flagged_unhelpful";

export async function recordCoachEvent(
  client: SupabaseClient,
  userId: string,
  eventType: CoachEventType,
  routeReason: string,
  responseId?: string
): Promise<void> {
  const { error } = await client.from("coach_events").insert({
    user_id: userId,
    event_type: eventType,
    route_reason: routeReason.slice(0, 96),
    response_id: responseId?.slice(0, 80) ?? null,
    metadata: { rulesHandled: eventType !== "response_flagged_unhelpful" },
  });
  if (error) throw error;
}

export function eventForIntent(intent: RulesIntent): CoachEventType {
  if (intent === "difficulty_feedback") return "difficulty_easy";
  if (intent === "missed_workout") return "missed_workout";
  if (intent === "soreness") return "soreness_reported";
  if (intent === "substitution" || intent === "swap_applied") return "substitution_requested";
  if (intent === "beginner_plan") return "plan_generated";
  return "rules_response";
}

export function responseHasPlan(response: CoachResponse): response is Extract<CoachResponse, { status: "plan_ready" | "plan_updated" }> {
  return response.status === "plan_ready" || response.status === "plan_updated";
}

// The durable data model stores only the prescription; it never stores the
// conversational wrapper. Failure is handled by the caller without exposing
// content in logs.
export async function persistCoachPlan(client: SupabaseClient, userId: string, plan: Plan, source: "rules" | "ai"): Promise<void> {
  const { data: program, error: programError } = await client.from("programs").insert({
    user_id: userId, source, goal: plan.goal, goal_type: plan.goal_type,
    experience_level: plan.experience_level, units: plan.units, timeline_weeks: plan.timeline_weeks,
    days_per_week: plan.days_per_week, split: plan.split, equipment: plan.equipment,
    progression_strategy: plan.progression_strategy,
  }).select("id").single();
  if (programError || !program) throw programError ?? new Error("Program persistence failed.");

  const { data: sessions, error: sessionsError } = await client.from("plan_sessions").insert(plan.sessions.map((session, position) => ({
    program_id: (program as any).id, user_id: userId, position, day_label: session.day_label,
    focus: session.focus, estimated_minutes: session.estimated_minutes,
  }))).select("id, position");
  if (sessionsError || !sessions) throw sessionsError ?? new Error("Session persistence failed.");
  const ids = new Map((sessions as any[]).map((session) => [session.position, session.id]));
  const rows = plan.sessions.flatMap((session, sessionPosition) => session.exercises.map((exercise, position) => ({
    program_id: (program as any).id, plan_session_id: ids.get(sessionPosition), user_id: userId,
    exercise_id: exercise.exercise_id, exercise_name: exercise.name, position,
    primary_muscles: exercise.primary_muscles, sets: exercise.sets, rep_min: exercise.rep_range.min,
    rep_max: exercise.rep_range.max, target_rpe: exercise.target_rpe, target_load: exercise.target_load,
    rest_seconds: exercise.rest_seconds,
  })));
  if (rows.some((row) => !row.plan_session_id)) throw new Error("Plan-session mapping failed.");
  const { error } = await client.from("plan_exercises").insert(rows);
  if (error) throw error;
}

// Product analytics event catalog, shared by the client (lib/analytics) and
// the ingestion endpoint (server/routes/analytics.ts). Pure: no Supabase, no
// React Native, so both sides validate the same contract.
//
// Privacy rule: properties are an explicit allowlist of short enums and
// small integers. Never add free text, names, emails, prompts, plan content,
// route parameters or anything a person typed.

export const ANALYTICS_SCHEMA_VERSION = 1;
export const MAX_EVENTS_PER_BATCH = 50;

type PropertySpec =
  | { kind: "enum"; values: readonly string[] }
  | { kind: "int"; min: number; max: number }
  | { kind: "screen" };

// Events the app may send. Server- and database-recorded events
// (signup_completed, coach_survey_completed, workout_started) are written
// directly and are deliberately NOT accepted from clients, so a client can't
// fabricate a conversion.
export const CLIENT_EVENTS = {
  app_first_open: {},
  signup_started: { method: { kind: "enum", values: ["email", "apple"] } },
  coach_survey_started: { entry: { kind: "enum", values: ["new", "rebuild"] } },
  plan_generated: {
    origin: { kind: "enum", values: ["setup", "coach_chat", "feedback", "import", "other"] },
    days_per_week: { kind: "int", min: 1, max: 7 },
    timeline_weeks: { kind: "int", min: 1, max: 52 },
  },
  workout_completed: {
    kind: { kind: "enum", values: ["plan", "adhoc"] },
    plan_week: { kind: "int", min: 1, max: 52 },
    session_index: { kind: "int", min: 0, max: 400 },
  },
  screen_view: { screen: { kind: "screen" } },
} as const satisfies Record<string, Record<string, PropertySpec>>;

export type ClientEventName = keyof typeof CLIENT_EVENTS;

export function isClientEventName(value: unknown): value is ClientEventName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLIENT_EVENTS, value);
}

// Stable route pattern from expo-router segments, e.g. "(tabs)/plan" or
// "equipment/[id]". Brackets are allowed (dynamic segment names); actual
// parameter values, query strings and spaces are not.
const SCREEN_PATTERN = /^[a-z0-9_()[\]\-/]{1,80}$/i;

export function screenNameFromSegments(segments: readonly string[]): string {
  const parts = segments.filter(Boolean);
  // A group's index route ("(tabs)") is reported as "(tabs)/index".
  if (parts.length === 0 || /^\(.*\)$/.test(parts[parts.length - 1])) parts.push("index");
  return parts.join("/");
}

export type AnalyticsProperties = Record<string, string | number>;

// Keeps only allowlisted, well-typed properties. Unknown keys are dropped
// rather than rejected so an older server tolerates a newer client.
export function sanitizeProperties(name: ClientEventName, input: unknown): AnalyticsProperties {
  const specs = CLIENT_EVENTS[name] as Record<string, PropertySpec>;
  const out: AnalyticsProperties = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, spec] of Object.entries(specs)) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined || value === null) continue;
    if (spec.kind === "enum" && typeof value === "string" && spec.values.includes(value)) out[key] = value;
    else if (spec.kind === "int" && Number.isInteger(value) && (value as number) >= spec.min && (value as number) <= spec.max) out[key] = value as number;
    else if (spec.kind === "screen" && typeof value === "string" && SCREEN_PATTERN.test(value) && !/[?#=&]/.test(value)) out[key] = value;
  }
  return out;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);

// A UUID-shaped id derived from a hex digest, for events whose identity is a
// real-world fact (e.g. "this plan workout was completed"), so retries and
// re-renders collapse to one row via the event_id primary key.
export function uuidFromHex(hex: string): string {
  const h = hex.replace(/[^0-9a-f]/gi, "").toLowerCase().padEnd(32, "0").slice(0, 32);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type ClientEvent = {
  event_id: string;
  event_name: ClientEventName;
  schema_version: number;
  occurred_at: string;
  installation_id: string;
  segment_id: string;
  session_id: string;
  user_id: string | null;
  platform: string;
  app_version: string;
  build_number: number;
  os_version: string | null;
  properties: AnalyticsProperties;
};

const MAX_PAST_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

// Validates one incoming event. Returns null for anything malformed; the
// caller drops it (one bad event never fails the whole batch).
export function validateClientEvent(input: unknown, now = Date.now()): ClientEvent | null {
  if (!input || typeof input !== "object") return null;
  const e = input as Record<string, unknown>;
  if (!isUuid(e.event_id) || !isUuid(e.installation_id) || !isUuid(e.segment_id) || !isUuid(e.session_id)) return null;
  if (!isClientEventName(e.event_name)) return null;
  if (e.schema_version !== ANALYTICS_SCHEMA_VERSION) return null;
  if (e.user_id !== null && e.user_id !== undefined && !isUuid(e.user_id)) return null;
  const occurredMs = typeof e.occurred_at === "string" ? Date.parse(e.occurred_at) : NaN;
  if (!Number.isFinite(occurredMs) || occurredMs < now - MAX_PAST_MS || occurredMs > now + MAX_FUTURE_MS) return null;
  const platform = e.platform === "ios" || e.platform === "android" || e.platform === "web" ? e.platform : null;
  if (!platform) return null;
  const appVersion = typeof e.app_version === "string" && /^[0-9A-Za-z.\-+]{1,20}$/.test(e.app_version) ? e.app_version : null;
  if (!appVersion) return null;
  if (!Number.isInteger(e.build_number) || (e.build_number as number) < 0 || (e.build_number as number) > 1_000_000) return null;
  const osVersion = typeof e.os_version === "string" && /^[0-9A-Za-z.\-_ ]{1,20}$/.test(e.os_version) ? e.os_version : null;
  return {
    event_id: e.event_id,
    event_name: e.event_name,
    schema_version: ANALYTICS_SCHEMA_VERSION,
    occurred_at: new Date(occurredMs).toISOString(),
    installation_id: e.installation_id,
    segment_id: e.segment_id,
    session_id: e.session_id,
    user_id: (e.user_id as string | null | undefined) ?? null,
    platform,
    app_version: appVersion,
    build_number: e.build_number as number,
    os_version: osVersion,
    properties: sanitizeProperties(e.event_name, e.properties),
  };
}

// Analytics contract, offline queue rules, cost estimates and log redaction.
// Pure functions only. Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTICS_SCHEMA_VERSION,
  sanitizeProperties,
  screenNameFromSegments,
  uuidFromHex,
  isUuid,
  validateClientEvent,
} from "../shared/analyticsEvents";
import { BATCH_SIZE, QUEUE_MAX_EVENTS, backoffMs, nextBatch, parseStoredQueue, pruneQueue, removeSent } from "../lib/analytics/queue";
import { estimateCostUsd } from "../server/lib/aiPricing";
import { clientMetadata, routeLabel } from "../server/lib/requestContext";

const NOW = Date.parse("2026-10-26T12:00:00Z");
let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function event(overrides: Record<string, unknown> = {}) {
  return {
    event_id: uuid(),
    event_name: "screen_view",
    schema_version: ANALYTICS_SCHEMA_VERSION,
    occurred_at: new Date(NOW - 1000).toISOString(),
    installation_id: "11111111-1111-4111-8111-111111111111",
    segment_id: "22222222-2222-4222-8222-222222222222",
    session_id: "33333333-3333-4333-8333-333333333333",
    user_id: null,
    platform: "ios",
    app_version: "1.0.8",
    build_number: 50,
    os_version: "27.0",
    properties: { screen: "(tabs)/plan" },
    ...overrides,
  } as any;
}

test("valid events pass and keep only allowlisted properties", () => {
  const ok = validateClientEvent(event({ properties: { screen: "equipment/[id]", email: "a@b.c" } }), NOW);
  assert.ok(ok);
  assert.deepEqual(ok!.properties, { screen: "equipment/[id]" });
});

test("malformed or untrusted events are rejected", () => {
  assert.equal(validateClientEvent(event({ event_name: "signup_completed" }), NOW), null, "server-only events can't come from clients");
  assert.equal(validateClientEvent(event({ event_name: "made_up" }), NOW), null);
  assert.equal(validateClientEvent(event({ event_id: "not-a-uuid" }), NOW), null);
  assert.equal(validateClientEvent(event({ schema_version: 2 }), NOW), null);
  assert.equal(validateClientEvent(event({ platform: "windows" }), NOW), null);
  assert.equal(validateClientEvent(event({ user_id: "admin" }), NOW), null);
  assert.equal(validateClientEvent(event({ occurred_at: new Date(NOW - 31 * 86400000).toISOString() }), NOW), null);
  assert.equal(validateClientEvent(event({ occurred_at: new Date(NOW + 2 * 86400000).toISOString() }), NOW), null);
  assert.equal(validateClientEvent(event({ app_version: "1.0.8; drop table" }), NOW), null);
  assert.equal(validateClientEvent(null, NOW), null);
});

test("property allowlist enforces types, ranges and enums", () => {
  assert.deepEqual(sanitizeProperties("plan_generated", { origin: "setup", days_per_week: 4, timeline_weeks: 99, note: "x" }), {
    origin: "setup",
    days_per_week: 4,
  });
  assert.deepEqual(sanitizeProperties("workout_completed", { kind: "plan", session_index: 1.5, plan_week: 2 }), { kind: "plan", plan_week: 2 });
  assert.deepEqual(sanitizeProperties("signup_started", { method: "google" }), {});
  assert.deepEqual(sanitizeProperties("screen_view", { screen: "workout-log?exercise=123" }), {});
  assert.deepEqual(sanitizeProperties("screen_view", { screen: "Bench press with Ana" }), {});
});

test("screen names come from route segments, not values", () => {
  assert.equal(screenNameFromSegments(["(tabs)", "plan"]), "(tabs)/plan");
  assert.equal(screenNameFromSegments(["equipment", "[id]"]), "equipment/[id]");
  assert.equal(screenNameFromSegments([]), "index");
  assert.equal(screenNameFromSegments(["(tabs)"]), "(tabs)/index");
});

test("fact-derived ids are stable UUIDs", () => {
  const hex = "ab".repeat(32);
  assert.equal(uuidFromHex(hex), uuidFromHex(hex));
  assert.ok(isUuid(uuidFromHex(hex)));
  assert.notEqual(uuidFromHex("cd".repeat(32)), uuidFromHex(hex));
});

test("queue drops expired events, dedupes, and stays bounded", () => {
  const fresh = event();
  const old = event({ occurred_at: new Date(NOW - 8 * 86400000).toISOString() });
  assert.deepEqual(pruneQueue([fresh, old, { ...fresh }], NOW), [fresh]);

  const many = Array.from({ length: QUEUE_MAX_EVENTS + 25 }, () => event());
  const pruned = pruneQueue(many, NOW);
  assert.equal(pruned.length, QUEUE_MAX_EVENTS);
  assert.equal(pruned[0].event_id, many[25].event_id, "keeps the newest");
});

test("batches send in order and acknowledged events leave the queue", () => {
  const queue = Array.from({ length: BATCH_SIZE + 3 }, () => event());
  const batch = nextBatch(queue);
  assert.equal(batch.length, BATCH_SIZE);
  const rest = removeSent(queue, batch.map((item) => item.event_id));
  assert.deepEqual(rest, queue.slice(BATCH_SIZE));
});

test("retry backoff grows and is capped", () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1, 0.5), 5000);
  assert.equal(backoffMs(3, 0.5), 20000);
  assert.equal(backoffMs(30, 0.5), 300000);
  assert.ok(backoffMs(2, 0) >= 7500 && backoffMs(2, 1) <= 12500);
});

test("unreadable stored queues are treated as empty", () => {
  assert.deepEqual(parseStoredQueue(null), []);
  assert.deepEqual(parseStoredQueue("{oops"), []);
  assert.deepEqual(parseStoredQueue(JSON.stringify({ a: 1 })), []);
  assert.equal(parseStoredQueue(JSON.stringify([event(), { nope: true }])).length, 1);
});

test("AI cost estimates use published rates and cached-input pricing", () => {
  assert.equal(estimateCostUsd("gpt-5-mini", 1_000_000, 0, 1_000_000), 2.25);
  assert.equal(estimateCostUsd("gpt-5-mini", 1_000_000, 1_000_000, 0), 0.025);
  assert.equal(estimateCostUsd("gpt-5-nano", 2000, 0, 1000), 0.0005);
  assert.equal(estimateCostUsd("some-new-model", 100, 0, 100), null);
});

test("request logs carry route shapes, never ids or query strings", () => {
  assert.equal(routeLabel("/api/coach-trainer/jobs/0a62b1d6-6a2a-4169-8817-2c6244bc7560?x=1"), "/api/coach-trainer/jobs/:id");
  assert.equal(routeLabel("/api/equipment/42/weight-factor"), "/api/equipment/:n/weight-factor");
  assert.equal(routeLabel("/api/videos?name=Ana"), "/api/videos");
});

test("client version headers are parsed defensively and are optional", () => {
  const headers = (map: Record<string, string>) => ({ header: (name: string) => map[name] }) as any;
  assert.deepEqual(clientMetadata(headers({})), { platform: null, appVersion: null, buildNumber: null, installationId: null });
  assert.deepEqual(
    clientMetadata(headers({
      "x-spotlift-platform": "iOS",
      "x-spotlift-version": "1.0.8",
      "x-spotlift-build": "50",
      "x-spotlift-installation": "11111111-1111-4111-8111-111111111111",
    })),
    { platform: "ios", appVersion: "1.0.8", buildNumber: 50, installationId: "11111111-1111-4111-8111-111111111111" }
  );
  assert.equal(clientMetadata(headers({ "x-spotlift-installation": "device-serial-123" })).installationId, null);
  assert.equal(clientMetadata(headers({ "x-spotlift-version": "<script>" })).appVersion, null);
});

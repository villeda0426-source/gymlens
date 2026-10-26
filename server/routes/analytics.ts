// First-party analytics ingestion (see docs/analytics/README.md).
//
// POST /api/analytics/events        batched client events (pre-signup allowed)
// POST /api/analytics/installation  upsert app_installations; link the
//                                   identity segment to the verified user
//
// Trust model: everything in the body is untrusted. A user id is stored only
// when it equals the user verified from the bearer token on this request;
// otherwise it's stored as null and resolved later through the segment link.
// Funnel conversions that matter (signup, survey submitted, workout started)
// are written by the database itself, not accepted from clients.
import { Router, Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { MAX_EVENTS_PER_BATCH, isUuid, validateClientEvent } from "../../shared/analyticsEvents";
import { bearerToken, clientMetadata, verifyUserId } from "../lib/requestContext";

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const MAX_BODY_BYTES = 64 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 300;
const MAX_EVENTS_PER_INSTALLATION = 1000;

// Kill switch: ANALYTICS_INGEST_ENABLED=false makes clients stop sending and
// empty their queues (they re-enable when it's switched back on).
export function analyticsEnabled(): boolean {
  return process.env.ANALYTICS_INGEST_ENABLED !== "false";
}

type Bucket = { count: number; resetAt: number };
const ipBuckets = new Map<string, Bucket>();
const installationBuckets = new Map<string, Bucket>();

function take(buckets: Map<string, Bucket>, key: string, amount: number, limit: number, now = Date.now()): boolean {
  if (buckets.size > 20_000) buckets.clear();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: amount, resetAt: now + WINDOW_MS });
    return amount <= limit;
  }
  bucket.count += amount;
  return bucket.count <= limit;
}

function limitBody(req: Request, res: Response, next: NextFunction) {
  const length = Number(req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return res.status(413).json({ error: "Payload too large." });
  if (!take(ipBuckets, req.ip || "unknown", 1, MAX_REQUESTS_PER_IP)) {
    return res.status(429).json({ error: "Too many analytics requests." });
  }
  next();
}

router.post("/events", limitBody, async (req: Request, res: Response) => {
  if (!analyticsEnabled()) return res.json({ ok: true, analyticsEnabled: false });
  const input = req.body?.events;
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_EVENTS_PER_BATCH) {
    return res.status(400).json({ error: `events must be an array of 1-${MAX_EVENTS_PER_BATCH} items.` });
  }

  const now = Date.now();
  const events = input.map((item) => validateClientEvent(item, now)).filter((item) => item !== null);
  if (events.length === 0) return res.json({ ok: true, analyticsEnabled: true, stored: 0, rejected: input.length });

  const installationId = events[0].installation_id;
  if (!take(installationBuckets, installationId, events.length, MAX_EVENTS_PER_INSTALLATION)) {
    return res.status(429).json({ error: "Too many analytics events." });
  }

  const verifiedUserId = await verifyUserId(bearerToken(req));
  const rows = events.map((event) => ({
    event_id: event.event_id,
    event_name: event.event_name,
    schema_version: event.schema_version,
    occurred_at: event.occurred_at,
    installation_id: event.installation_id,
    segment_id: event.segment_id,
    session_id: event.session_id,
    user_id: event.user_id && event.user_id === verifiedUserId ? verifiedUserId : null,
    source: "client",
    platform: event.platform,
    app_version: event.app_version,
    build_number: event.build_number,
    os_version: event.os_version,
    properties: event.properties,
  }));

  const { error } = await supabase.from("analytics_events").upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) {
    // 503 keeps the events queued on the device for a later retry.
    console.error("[analytics] insert error:", error.message);
    return res.status(503).json({ error: "Analytics storage unavailable." });
  }
  return res.json({ ok: true, analyticsEnabled: true, stored: rows.length, rejected: input.length - rows.length });
});

router.post("/installation", limitBody, async (req: Request, res: Response) => {
  if (!analyticsEnabled()) return res.json({ ok: true, analyticsEnabled: false });
  const installationId = req.body?.installation_id;
  const segmentId = req.body?.segment_id;
  if (!isUuid(installationId) || (segmentId !== undefined && segmentId !== null && !isUuid(segmentId))) {
    return res.status(400).json({ error: "installation_id must be a UUID." });
  }
  const osVersion = typeof req.body?.os_version === "string" && /^[0-9A-Za-z.\-_ ]{1,20}$/.test(req.body.os_version)
    ? req.body.os_version
    : null;
  const meta = clientMetadata(req);
  const userId = await verifyUserId(bearerToken(req));
  const nowIso = new Date().toISOString();

  // created_at (first seen) is never sent, so the upsert keeps the original.
  // user_id is only ever set from the verified token, never cleared on a
  // signed-out launch (it records the last account seen on the device).
  const { error } = await supabase.from("app_installations").upsert(
    {
      installation_id: installationId,
      platform: meta.platform,
      app_version: meta.appVersion,
      build_number: meta.buildNumber,
      os_version: osVersion,
      last_seen_at: nowIso,
      ...(userId ? { user_id: userId } : {}),
    },
    { onConflict: "installation_id" }
  );
  if (error) {
    console.error("[analytics] installation upsert error:", error.message);
    return res.status(503).json({ error: "Analytics storage unavailable." });
  }

  if (userId && segmentId) {
    // First verified account in a segment owns it; the client rotates the
    // segment at logout, so a later account never inherits earlier activity.
    const { error: linkError } = await supabase
      .from("installation_identities")
      .upsert({ segment_id: segmentId, installation_id: installationId, user_id: userId }, { onConflict: "segment_id", ignoreDuplicates: true });
    if (linkError) console.error("[analytics] identity link error:", linkError.message);
  }

  return res.json({ ok: true, analyticsEnabled: true });
});

export default router;

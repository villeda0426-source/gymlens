// Pure queue rules for the analytics outbox (lib/analytics/index.ts holds the
// storage and network side). Kept free of React Native so it's unit-tested.

import type { ClientEvent } from "../../shared/analyticsEvents";

export const QUEUE_MAX_EVENTS = 500;
export const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const BATCH_SIZE = 50;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

// Drops events past the age limit, de-duplicates by event_id (first copy
// wins) and keeps the newest QUEUE_MAX_EVENTS. Order is preserved.
export function pruneQueue(queue: ClientEvent[], now = Date.now()): ClientEvent[] {
  const seen = new Set<string>();
  const kept: ClientEvent[] = [];
  for (const event of queue) {
    if (seen.has(event.event_id)) continue;
    const at = Date.parse(event.occurred_at);
    if (!Number.isFinite(at) || now - at > QUEUE_MAX_AGE_MS) continue;
    seen.add(event.event_id);
    kept.push(event);
  }
  return kept.length > QUEUE_MAX_EVENTS ? kept.slice(kept.length - QUEUE_MAX_EVENTS) : kept;
}

export function nextBatch(queue: ClientEvent[]): ClientEvent[] {
  return queue.slice(0, BATCH_SIZE);
}

// Removes the events the server has acknowledged (accepted or already had).
export function removeSent(queue: ClientEvent[], sentIds: Iterable<string>): ClientEvent[] {
  const sent = new Set(sentIds);
  return queue.filter((event) => !sent.has(event.event_id));
}

// Exponential backoff with jitter: 5s, 10s, 20s ... capped at 5 minutes.
export function backoffMs(failures: number, random = Math.random()): number {
  if (failures <= 0) return 0;
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
  return Math.round(base * (0.75 + random * 0.5));
}

// Parses whatever was in storage; anything unreadable is treated as empty
// rather than crashing the app.
export function parseStoredQueue(raw: string | null): ClientEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.event_id === "string") : [];
  } catch {
    return [];
  }
}

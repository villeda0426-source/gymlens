// First-party product analytics: a persistent, bounded outbox delivered in the
// background to POST /api/analytics/events (see docs/analytics/README.md).
//
// Guarantees:
// - Never blocks or throws into app code. Every public function swallows its
//   own errors; failures are silent in production, logged in development.
// - Identifiers are random (expo-crypto). No hardware, advertising or
//   fingerprinting identifiers. The installation id lives in AsyncStorage, so
//   deleting the app (or clearing its data) starts a new installation.
// - Off switches: EXPO_PUBLIC_ANALYTICS_ENABLED=false at build time, or the
//   server answering { analyticsEnabled: false }, which also empties the queue.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { AppState, Platform } from "react-native";
import { getApiBase, getAppRequestHeaders, getNativeAppVersion, getNativeBuildNumber } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  ANALYTICS_SCHEMA_VERSION,
  sanitizeProperties,
  uuidFromHex,
  type AnalyticsProperties,
  type ClientEvent,
  type ClientEventName,
} from "@/shared/analyticsEvents";
import { backoffMs, nextBatch, parseStoredQueue, pruneQueue, removeSent } from "@/lib/analytics/queue";
import { setInstallationId } from "@/lib/analytics/identity";

const INSTALLATION_KEY = "spotlift.analytics.installation_id";
const SEGMENT_KEY = "spotlift.analytics.segment_id";
const QUEUE_KEY = "spotlift.analytics.queue";
const SERVER_DISABLED_KEY = "spotlift.analytics.server_disabled";

const BUILD_ENABLED = process.env.EXPO_PUBLIC_ANALYTICS_ENABLED !== "false";
const SESSION_IDLE_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const FLUSH_DEBOUNCE_MS = 3_000;

let initPromise: Promise<boolean> | null = null;
let serverDisabled = false;
let installationId = "";
let segmentId = "";
let sessionId = "";
let backgroundedAt: number | null = null;
let currentUserId: string | null = null;
let queue: ClientEvent[] = [];
let flushing: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let retryAfter = 0;

function debug(...args: unknown[]) {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.log("[analytics]", ...args);
}

function enabled(): boolean {
  return BUILD_ENABLED && !serverDisabled && !!getApiBase();
}

async function persistQueue(): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    debug("queue persist failed", error);
  }
}

async function loadOrCreate(key: string): Promise<{ id: string; created: boolean }> {
  const existing = await AsyncStorage.getItem(key);
  if (existing) return { id: existing, created: false };
  const id = Crypto.randomUUID();
  await AsyncStorage.setItem(key, id);
  return { id, created: true };
}

async function authHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function post(path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const base = getApiBase();
  if (!base) throw new Error("API base not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAppRequestHeaders(), ...(await authHeader()) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function applyServerSwitch(payload: any) {
  if (payload && payload.analyticsEnabled === false) {
    serverDisabled = true;
    queue = [];
    void persistQueue();
    AsyncStorage.setItem(SERVER_DISABLED_KEY, "1").catch(() => undefined);
  } else if (payload && payload.analyticsEnabled === true && serverDisabled) {
    serverDisabled = false;
    AsyncStorage.removeItem(SERVER_DISABLED_KEY).catch(() => undefined);
  }
}

// Upserts this installation's app_installations row and, when signed in,
// links the current identity segment to the verified user. Launch + sign-in.
async function registerInstallation(): Promise<void> {
  if (!BUILD_ENABLED || !installationId || !getApiBase()) return;
  try {
    const response = await post("/api/analytics/installation", {
      installation_id: installationId,
      segment_id: segmentId,
      os_version: String(Platform.Version ?? "").slice(0, 20) || null,
    });
    if (response.ok) applyServerSwitch(await response.json().catch(() => null));
  } catch (error) {
    debug("installation register failed", error);
  }
}

function startSession() {
  sessionId = Crypto.randomUUID();
}

export function initAnalytics(): Promise<boolean> {
  if (!initPromise) {
    initPromise = (async () => {
      if (!BUILD_ENABLED) return false;
      try {
        serverDisabled = (await AsyncStorage.getItem(SERVER_DISABLED_KEY)) === "1";
        const installation = await loadOrCreate(INSTALLATION_KEY);
        installationId = installation.id;
        setInstallationId(installationId);
        segmentId = (await loadOrCreate(SEGMENT_KEY)).id;
        startSession();
        queue = pruneQueue(parseStoredQueue(await AsyncStorage.getItem(QUEUE_KEY)));

        AppState.addEventListener("change", (state) => {
          if (state === "active") {
            if (backgroundedAt !== null && Date.now() - backgroundedAt > SESSION_IDLE_MS) startSession();
            backgroundedAt = null;
            scheduleFlush(0);
          } else if (state === "background") {
            backgroundedAt = Date.now();
            void flushAnalytics();
          }
        });

        if (installation.created) enqueue("app_first_open", {});
        void registerInstallation();
        scheduleFlush(FLUSH_DEBOUNCE_MS);
        return true;
      } catch (error) {
        debug("init failed", error);
        return false;
      }
    })();
  }
  return initPromise;
}

function enqueue(name: ClientEventName, properties: AnalyticsProperties, eventId?: string) {
  if (!enabled()) return;
  queue = pruneQueue([
    ...queue,
    {
      event_id: eventId ?? Crypto.randomUUID(),
      event_name: name,
      schema_version: ANALYTICS_SCHEMA_VERSION,
      occurred_at: new Date().toISOString(),
      installation_id: installationId,
      segment_id: segmentId,
      session_id: sessionId,
      user_id: currentUserId,
      platform: Platform.OS,
      app_version: getNativeAppVersion(),
      build_number: getNativeBuildNumber(),
      os_version: String(Platform.Version ?? "").slice(0, 20) || null,
      properties: sanitizeProperties(name, properties),
    },
  ]);
  void persistQueue();
  scheduleFlush(FLUSH_DEBOUNCE_MS);
  debug("queued", name, properties);
}

// Records an event. `dedupeKey` makes the event id a function of a real-world
// fact (e.g. "workout X completed") so repeats collapse to one stored row.
export function track(name: ClientEventName, properties: AnalyticsProperties = {}, options: { dedupeKey?: string } = {}): void {
  void (async () => {
    try {
      if (!(await initAnalytics())) return;
      const eventId = options.dedupeKey
        ? uuidFromHex(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${name}:${options.dedupeKey}`))
        : undefined;
      enqueue(name, properties, eventId);
    } catch (error) {
      debug("track failed", name, error);
    }
  })();
}

function scheduleFlush(delayMs: number) {
  if (flushTimer) clearTimeout(flushTimer);
  const wait = Math.max(delayMs, retryAfter - Date.now());
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, wait);
}

export function flushAnalytics(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      while (enabled() && queue.length > 0 && Date.now() >= retryAfter) {
        const batch = nextBatch(queue);
        const response = await post("/api/analytics/events", { events: batch });
        if (response.ok) {
          applyServerSwitch(await response.json().catch(() => null));
          queue = removeSent(queue, batch.map((event) => event.event_id));
          failures = 0;
          await persistQueue();
        } else if (response.status === 400 || response.status === 413) {
          // The server validates per event; a whole-batch rejection means the
          // batch itself can never succeed. Drop it rather than retry forever.
          queue = removeSent(queue, batch.map((event) => event.event_id));
          await persistQueue();
        } else {
          throw new Error(`analytics HTTP ${response.status}`);
        }
      }
    } catch (error) {
      failures += 1;
      retryAfter = Date.now() + backoffMs(failures);
      debug("flush failed; retry in", retryAfter - Date.now(), "ms", error);
      scheduleFlush(0);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

// Called from the root layout whenever the Supabase session changes.
// Logout (or a direct switch to another account) rotates the identity
// segment, so activity after it is never attributed to the previous user.
export function setAnalyticsUser(userId: string | null): void {
  void (async () => {
    try {
      if (!(await initAnalytics())) return;
      if (userId === currentUserId) return;
      const previous = currentUserId;
      if (previous !== null) {
        segmentId = Crypto.randomUUID();
        await AsyncStorage.setItem(SEGMENT_KEY, segmentId);
      }
      currentUserId = userId;
      if (userId) void registerInstallation();
    } catch (error) {
      debug("identity update failed", error);
    }
  })();
}

// Best effort before sign-out: send what's queued while the outgoing user's
// token is still valid. Never waits longer than `timeoutMs`.
export async function flushAnalyticsBeforeSignOut(timeoutMs = 2_000): Promise<void> {
  try {
    await Promise.race([flushAnalytics(), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  } catch {
    // Never block sign-out.
  }
}

let lastScreen: string | null = null;

export function trackScreen(screen: string): void {
  if (screen === lastScreen) return;
  lastScreen = screen;
  track("screen_view", { screen });
}

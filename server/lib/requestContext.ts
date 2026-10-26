// Per-request context (AsyncLocalStorage): request id, untrusted client
// version metadata, and a lazily verified user id. AI usage logging reads it,
// so every model call is attributed without threading arguments through each
// service. Background work captures it with runWithContext().
//
// Client headers are diagnostic only — never identity or authorization. The
// user id comes solely from verifying the bearer token with Supabase Auth.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Actor = "user" | "anonymous" | "system";

export type RequestContext = {
  requestId: string;
  platform: string | null;
  appVersion: string | null;
  buildNumber: number | null;
  installationId: string | null;
  // Resolves to the verified user id (or null). Memoized per request.
  resolveUserId: () => Promise<string | null>;
  // "system" for scripts and other work no client asked for.
  actor?: Actor;
};

const storage = new AsyncLocalStorage<RequestContext>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_CACHE_MS = 60_000;
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map<string, { userId: string | null; expiresAt: number }>();

let authClient: SupabaseClient | null = null;
function getAuthClient(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  authClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return authClient;
}

export function bearerToken(req: Pick<Request, "header">): string | null {
  return req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

// Verifies a Supabase access token; results are cached briefly so analytics
// and AI attribution don't add an Auth round trip per call.
export async function verifyUserId(token: string | null): Promise<string | null> {
  if (!token) return null;
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > now) return cached.userId;
  const client = getAuthClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser(token);
    const userId = error || !data.user ? null : data.user.id;
    if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.clear();
    tokenCache.set(token, { userId, expiresAt: now + TOKEN_CACHE_MS });
    return userId;
  } catch {
    return null;
  }
}

function clean(value: string | undefined, pattern: RegExp, max: number): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed && trimmed.length <= max && pattern.test(trimmed) ? trimmed : null;
}

export function clientMetadata(req: Pick<Request, "header">) {
  const platform = clean(req.header("x-spotlift-platform")?.toLowerCase(), /^(ios|android|web)$/, 10);
  const appVersion = clean(req.header("x-spotlift-version"), /^[0-9A-Za-z.\-+]+$/, 20);
  const build = Number.parseInt(req.header("x-spotlift-build") ?? "", 10);
  const installation = req.header("x-spotlift-installation");
  return {
    platform,
    appVersion,
    buildNumber: Number.isFinite(build) && build >= 0 && build <= 1_000_000 ? build : null,
    installationId: installation && UUID.test(installation) ? installation : null,
  };
}

// Path without its query string, with ids collapsed (".../jobs/:id"), so logs
// never carry parameter values.
export function routeLabel(originalUrl: string): string {
  return (originalUrl.split("?")[0] || "/")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d+(?=\/|$)/g, "/:n")
    .slice(0, 120);
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const token = bearerToken(req);
  let userPromise: Promise<string | null> | null = null;
  const context: RequestContext = {
    requestId,
    ...clientMetadata(req),
    resolveUserId: () => (userPromise ??= verifyUserId(token)),
  };
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    if (req.path === "/health") return;
    console.log(
      JSON.stringify({
        event: "http_request",
        requestId,
        method: req.method,
        route: routeLabel(req.originalUrl),
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        platform: context.platform ?? "unknown",
        appVersion: context.appVersion ?? "unknown",
        appBuild: context.buildNumber ?? "unknown",
      })
    );
  });
  storage.run(context, next);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

// For work that outlives the request (e.g. Coach background jobs): runs `fn`
// with a frozen copy of the context and an already-verified user id.
export function runWithContext<T>(context: Omit<RequestContext, "resolveUserId"> & { userId: string | null }, fn: () => Promise<T>): Promise<T> {
  const { userId, ...rest } = context;
  return storage.run({ ...rest, resolveUserId: async () => userId }, fn);
}

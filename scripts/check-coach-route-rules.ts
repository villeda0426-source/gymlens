// Offline check of the Coach route's rules path. POST /api/coach-trainer now
// requires authentication (a real, deliberate security fix: it always did for
// /jobs, but not for POST / until the account-history work), so the HTTP-level
// checks here cover the auth gate and payload validation. The authenticated
// routing/history behavior is exercised through runCoachRequest directly, the
// same exported function POST / and /jobs both call after authenticating -
// this avoids needing a real Supabase auth backend while still running the
// actual production code path, not a reimplementation of it.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request } from "express";

process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-check";
delete process.env.COACH_RULES_ROUTER;

const fakeReq = (body: unknown): Request => ({ body, header: () => undefined }) as unknown as Request;

async function main() {
  const express = (await import("express")).default;
  const routeModule = await import("../server/routes/coach-trainer");
  const { runCoachRequest } = routeModule;
  const router = routeModule.default;
  const app = express();
  app.use(express.json());
  app.use("/api/coach-trainer", router);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/coach-trainer`;

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };

  const post = async (body: unknown) => {
    const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json()) as any };
  };

  let failures = 0;
  const check = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); originalLog("PASS", name); } catch (e: any) { failures++; originalLog("FAIL", name, "-", e.message); }
  };

  await check("POST / without auth is rejected (the account-history work requires it everywhere, not just /jobs)", async () => {
    const r = await post({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: "hi" });
    assert.equal(r.status, 401);
  });

  const clearedProfile = {
    profile: { experienceLevel: null, goal: null, equipmentType: null, daysPerWeek: null, ageBand: "adult_18_59" as const, safetyReviewedAt: new Date().toISOString() },
    activeLimitationTypes: [],
    recentEvents: [],
    loadError: false,
  };

  const secret = "zebra-unique-marker";
  await check("intake: routine beginner request returns a plan from templates, fast (no account history)", async () => {
    const t0 = Date.now();
    const r: any = await runCoachRequest(fakeReq({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: `I'm a beginner, build muscle, 3 days a week at a full gym, no injuries ${secret}` }), undefined, { history: clearedProfile });
    assert.equal(r.status, "plan_ready");
    assert.equal(r.plan.sessions.length, 3);
    assert.ok(Date.now() - t0 < 1000);
  });

  await check("missing/unavailable account history forces AI, not rules, for an otherwise-routine request", async () => {
    const failedHistory = { profile: null, activeLimitationTypes: [], recentEvents: [], loadError: true };
    const req = fakeReq({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: "I'm a beginner, build muscle, 3 days a week at a full gym, no injuries" });
    // No AI provider is configured offline, so a request forced to AI throws
    // (a configuration error) instead of returning a rules template; that
    // throw is the signal that it did not take the rules shortcut.
    await assert.rejects(runCoachRequest(req, undefined, { history: failedHistory }));
  });

  await check("chat: view plan in Spanish", async () => {
    const intake: any = await runCoachRequest(fakeReq({ mode: "intake", units: "kg", language: "es", history: [], userMessage: "Soy principiante, ganar fuerza, 2 días por semana, sin equipo, sin lesiones" }), undefined, { history: clearedProfile });
    assert.equal(intake.status, "plan_ready");
    const r: any = await runCoachRequest(fakeReq({ mode: "chat", units: "kg", language: "es", currentPlan: intake.plan, question: "muéstrame mi plan" }), undefined, { history: clearedProfile });
    assert.equal(r.status, "reply");
    assert.match(r.message, /Semana 1/);
  });

  await check("stage two: explicit swap returns plan_updated, nutrition returns a reply", async () => {
    const intake: any = await runCoachRequest(fakeReq({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: "I'm a beginner, build muscle, 3 days a week at a full gym, no injuries" }), undefined, { history: clearedProfile });
    assert.equal(intake.status, "plan_ready");
    const swap: any = await runCoachRequest(fakeReq({ mode: "adapt", units: "lbs", language: "en", currentPlan: intake.plan, logs: [{ date: "2026-09-21", session_label: "Coach update", exercise_id: "general-update", sets: [], skipped: false, user_note: "swap leg press for goblet squat, I do not have a leg press" }] }), undefined, { history: clearedProfile });
    assert.equal(swap.status, "plan_updated");
    assert.ok(!swap.plan.sessions.flatMap((s: any) => s.exercises).some((e: any) => e.name === "Leg Press"));
    const protein: any = await runCoachRequest(fakeReq({ mode: "chat", units: "lbs", language: "en", currentPlan: intake.plan, question: "how much protein do I need?" }), undefined, { history: clearedProfile });
    assert.equal(protein.status, "reply");
    assert.match(protein.message, /1\.6-2\.2/);
  });

  await check("a saved profile with a fresh safety review does not by itself force AI", async () => {
    const r: any = await runCoachRequest(fakeReq({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: "I'm a beginner, build muscle, 3 days a week at a full gym, no injuries" }), undefined, { history: clearedProfile });
    assert.equal(r.status, "plan_ready");
  });

  await check("invalid payloads are rejected, not silently routed anywhere", async () => {
    const noUnits = await runCoachRequest(fakeReq({ mode: "intake", language: "en", userMessage: "hi" }), undefined, { history: clearedProfile }).catch((e) => e);
    assert.match(noUnits.message, /units must be kg or lbs/);
    const noMessage = await runCoachRequest(fakeReq({ mode: "intake", units: "lbs", userMessage: "  " }), undefined, { history: clearedProfile }).catch((e) => e);
    assert.match(noMessage.message, /userMessage is required/);
  });

  await check("router logs metadata only, never message text", async () => {
    const line = logs.find((l) => l.startsWith("[coach-router]") && l.includes("routeReason=rule:beginner_plan"));
    assert.ok(line, "no router log line");
    assert.ok(!logs.some((l) => l.includes(secret)), "message text leaked into logs");
  });

  console.log = originalLog;
  server.close();
  if (failures) { originalLog(`\n${failures} failed`); process.exit(1); }
  originalLog("\nall passed");
  process.exit(0);
}
main();

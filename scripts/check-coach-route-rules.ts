// Offline end-to-end check of POST /api/coach-trainer for rules-routed requests.
// Uses dummy Supabase env values and only sends payloads the router answers from
// templates (or rejects), so it never reaches OpenAI or a real database.
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-check";
delete process.env.COACH_RULES_ROUTER;

async function main() {
  const express = (await import("express")).default;
  const router = (await import("../server/routes/coach-trainer")).default;
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
    const started = Date.now();
    const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json()) as any, ms: Date.now() - started };
  };

  let failures = 0;
  const check = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); originalLog("PASS", name); } catch (e: any) { failures++; originalLog("FAIL", name, "-", e.message); }
  };

  const secret = "zebra-unique-marker";
  await check("intake: routine beginner request returns a plan from templates, fast", async () => {
    const r = await post({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: `I'm a beginner, build muscle, 3 days a week at a full gym, no injuries ${secret}` });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "plan_ready");
    assert.equal(r.body.plan.sessions.length, 3);
    assert.ok(r.ms < 1000, `took ${r.ms}ms`);
  });

  await check("chat: view plan in Spanish", async () => {
    const intake = await post({ mode: "intake", units: "kg", language: "es", history: [], userMessage: "Soy principiante, ganar fuerza, 2 días por semana, sin equipo, sin lesiones" });
    assert.equal(intake.body.status, "plan_ready");
    const r = await post({ mode: "chat", units: "kg", language: "es", currentPlan: intake.body.plan, question: "muéstrame mi plan" });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "reply");
    assert.match(r.body.message, /Semana 1/);
  });

  await check("stage two through the real route: explicit swap returns plan_updated, nutrition returns a reply", async () => {
    const intake = await post({ mode: "intake", units: "lbs", language: "en", history: [], userMessage: "I'm a beginner, build muscle, 3 days a week at a full gym, no injuries" });
    assert.equal(intake.body.status, "plan_ready");
    const swap = await post({ mode: "adapt", units: "lbs", language: "en", currentPlan: intake.body.plan, logs: [{ date: "2026-09-21", session_label: "Coach update", exercise_id: "general-update", sets: [], skipped: false, user_note: "swap leg press for goblet squat" }] });
    assert.equal(swap.status, 200);
    assert.equal(swap.body.status, "plan_updated");
    assert.ok(!swap.body.plan.sessions.flatMap((s: any) => s.exercises).some((e: any) => e.name === "Leg Press"));
    const protein = await post({ mode: "chat", units: "lbs", language: "en", currentPlan: intake.body.plan, question: "how much protein do I need?" });
    assert.equal(protein.body.status, "reply");
    assert.match(protein.body.message, /1\.6-2\.2/);
    assert.ok(swap.ms < 1000 && protein.ms < 1000);
  });

  await check("invalid payloads are rejected, not silently routed anywhere", async () => {
    const noUnits = await post({ mode: "intake", language: "en", userMessage: "hi" });
    assert.equal(noUnits.status, 400);
    assert.match(noUnits.body.error, /units must be kg or lbs/);
    const noMessage = await post({ mode: "intake", units: "lbs", userMessage: "  " });
    assert.equal(noMessage.status, 400);
    assert.match(noMessage.body.error, /userMessage is required/);
  });

  await check("router logs metadata only, never message text", async () => {
    const line = logs.find((l) => l.startsWith("[coach-router]") && l.includes("intent=beginner_plan"));
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

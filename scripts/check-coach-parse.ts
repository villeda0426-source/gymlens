// Offline check for Coach response parsing. No network or AI calls.
import assert from "node:assert/strict";
import { parseCoachResponse, isCoachFallbackEligibleError } from "../server/services/coachTrainerService";

const exercise = { exercise_id: "bench", name: "Bench", category: "compound", primary_muscles: ["chest"], sets: 3, rep_range: { min: 6, max: 10 }, target_rpe: 8, target_load: "moderate", rest_seconds: 120, tempo: null, progression_rule: "add reps", substitutions: [], coach_notes: "brace" };
const plan = { goal: "g", goal_type: "hypertrophy", experience_level: "intermediate", units: "lbs", timeline_weeks: 3, days_per_week: 1, split: "Full", equipment: [], constraints: [], progression_strategy: "p", sessions: [{ day_label: "W1D1", focus: "f", estimated_minutes: 45, exercises: [exercise] }], weekly_notes: "n", safety_flags: [] };
const good = JSON.stringify({ status: "plan_ready", summary: "s", plan });

let failures = 0;
const check = (name: string, fn: () => void) => { try { fn(); console.log("PASS", name); } catch (e: any) { failures++; console.log("FAIL", name, "-", e.message); } };

check("valid compact JSON parses", () => assert.equal(parseCoachResponse(good).status, "plan_ready"));
check("fenced JSON parses", () => assert.equal(parseCoachResponse("```json\n" + good + "\n```").status, "plan_ready"));
check("stray trailing junk after complete object is recovered", () => assert.equal(parseCoachResponse(good + '"}').status, "plan_ready"));
check("stray quote between the final closing braces is recovered", () => assert.equal(parseCoachResponse(good.slice(0, -1) + '"}').status, "plan_ready"));
check("schema-invalid response is still rejected after trimming", () => {
  const bad = JSON.stringify({ status: "plan_ready", summary: "s", plan: { ...plan, sessions: [{ ...plan.sessions[0], exercises: [{ ...exercise, sets: "three" }] }] } });
  assert.throws(() => parseCoachResponse(bad), /expected schema/);
});
check("truncated JSON is still rejected", () => assert.throws(() => parseCoachResponse(good.slice(0, good.length - 40))));
check("reply and gathering statuses parse", () => {
  assert.equal(parseCoachResponse('{"status":"reply","message":"hi"}').status, "reply");
  assert.equal(parseCoachResponse('{"status":"gathering","message":"q"}').status, "gathering");
});

// Regression: the OpenAI SDK's error classes (APIUserAbortError,
// APIConnectionError, APIConnectionTimeoutError, ...) don't set `.name` to
// match their class - it stays the generic "Error". A classifier that only
// checks `.name` misses every real timeout/abort from the actual client,
// so a genuine timeout would crash instead of retrying or falling back to
// the deterministic plan. Caught live: a real OpenAI call that aborted
// propagated an uncaught error all the way to the route instead of
// triggering the fallback-model retry.
class FakeAPIUserAbortError extends Error {
  constructor() { super("Request was aborted."); }
}
check("an OpenAI SDK abort error (generic .name, typed constructor) is fallback-eligible", () => {
  const err = new FakeAPIUserAbortError();
  assert.equal(err.name, "Error", "test fixture must reproduce the SDK's actual .name shape");
  assert.equal(isCoachFallbackEligibleError(err), true);
});
check("a genuinely unrelated error is still not fallback-eligible", () => {
  assert.equal(isCoachFallbackEligibleError(new Error("some unrelated failure")), false);
});

if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log("all passed");

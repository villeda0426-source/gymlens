// Offline check for the rules-first Coach router. No network, no AI calls, no Supabase.
import assert from "node:assert/strict";
import { routeCoachRequest, detectRiskSignals, type CoachRouterInput, type RouteDecision } from "../server/services/coachRouter";
import { buildBeginnerPlanResponse, type BeginnerEquipment, type BeginnerGoal } from "../server/services/coachTemplates";
import { isPlan } from "../server/services/coachTrainerService";

let failures = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log("PASS", name); } catch (e: any) { failures++; console.log("FAIL", name, "-", e.message); }
};

const intake = (userMessage: string, extra: Partial<CoachRouterInput> = {}): RouteDecision =>
  routeCoachRequest({ mode: "intake", units: "lbs", language: "en", userMessage, history: [], ...extra });

const expectRules = (d: RouteDecision, intent: string) => {
  assert.equal(d.route, "rules", d.route === "ai" ? `went to AI: ${d.reason}` : "");
  if (d.route === "rules") assert.equal(d.intent, intent);
};
const expectAi = (d: RouteDecision, reasonPrefix?: string) => {
  assert.equal(d.route, "ai", d.route === "rules" ? "was handled by rules but should go to AI" : "");
  if (d.route === "ai" && reasonPrefix) assert.ok(d.reason.startsWith(reasonPrefix), `reason was ${d.reason}`);
};

// ---- Intake: routine -> rules -------------------------------------------------
check("EN clean beginner gym request -> rules plan", () => {
  const d = intake("I'm a beginner, I want to build muscle, 3 days a week at a full gym, no injuries.");
  expectRules(d, "beginner_plan");
  if (d.route === "rules" && d.response.status === "plan_ready") {
    assert.equal(d.response.plan.days_per_week, 3);
    assert.equal(d.response.plan.goal_type, "hypertrophy");
    assert.equal(d.response.plan.sessions.length, 3);
  }
});
check("ES clean beginner request -> rules plan in Spanish", () => {
  const d = intake("Soy principiante, quiero perder grasa, 3 días por semana en un gimnasio, sin lesiones.", { language: "es", units: "kg" });
  expectRules(d, "beginner_plan");
  if (d.route === "rules" && d.response.status === "plan_ready") {
    assert.equal(d.response.plan.goal_type, "fat_loss");
    assert.match(d.response.plan.sessions[0].day_label, /Semana 1/);
    assert.equal(d.response.plan.units, "kg");
  }
});
check("home dumbbells, 3 days, 30 minutes", () => {
  const d = intake("New to lifting, want to get stronger. 3 days per week with dumbbells at home, 30 minutes. No injuries.");
  expectRules(d, "beginner_plan");
  if (d.route === "rules" && d.response.status === "plan_ready") {
    assert.equal(d.response.plan.sessions.length, 3);
    assert.ok(d.response.plan.sessions.every((s) => s.estimated_minutes === 30 && s.exercises.length === 4));
  }
});
check("4 days is not pushed down or up by rules: it goes to the AI, which honors the request", () =>
  expectAi(intake("New to lifting, want to get stronger. 4 days per week with dumbbells at home. No injuries."), "days:"));
check("bodyweight, 2 days", () => expectRules(intake("I'm a beginner and want to get in shape. 2 days a week, no equipment. No health issues."), "beginner_plan"));
check("range '3-4 days' takes the lower number", () => {
  const d = intake("Beginner, lose weight, 3-4 days a week at the gym, no injuries");
  expectRules(d, "beginner_plan");
  if (d.route === "rules" && d.response.status === "plan_ready") assert.equal(d.response.plan.days_per_week, 3);
});
check("multi-turn: details spread across the conversation -> rules", () => {
  const d = intake("I'm a beginner, 3 days a week, dumbbells at home, no health issues", {
    history: [
      { role: "user", content: 'CONTEXT: {"mode":"intake","units":"lbs"}\n\nI want to get in shape' },
      { role: "assistant", content: '{"status":"gathering","message":"How many days?"}' },
    ],
  });
  expectRules(d, "beginner_plan");
});
check("'no injuries or pain' is not treated as a risk", () => assert.deepEqual(detectRiskSignals("I have no injuries or pain and no health conditions"), []));
check("ES 'sin lesiones ni dolor' is not treated as a risk", () => assert.deepEqual(detectRiskSignals("No tengo lesiones ni dolor"), []));

// ---- Intake: must go to AI ----------------------------------------------------
const base = "I'm a beginner, build muscle, 3 days a week at a full gym";
const aiCases: Array<[string, string, string | undefined]> = [
  ["knee pain", `${base}, my knee hurts when I squat.`, "risk:"],
  ["negation followed by real pain", `${base}, no injuries but my knee hurts sometimes.`, "risk:"],
  ["chest pain", `${base}. I sometimes get chest pain on stairs.`, "risk:"],
  ["dizziness", `${base}, no injuries, though I felt dizzy last week.`, "risk:"],
  ["pregnancy", `${base}, no injuries. I am pregnant.`, "risk:"],
  ["ES pregnancy", "Soy principiante, quiero ganar músculo, 3 días por semana en gimnasio, sin lesiones, estoy embarazada.", "risk:"],
  ["ES pain despite 'sin lesiones'", "Soy principiante, quiero ganar músculo, 3 días por semana en gimnasio, sin lesiones pero me duele la espalda.", "risk:"],
  ["recent surgery", `${base}, no injuries, had surgery 2 months ago.`, "risk:"],
  ["medication / condition", `${base}, no injuries, I take blood pressure medication.`, "risk:"],
  ["age 65", `${base}, no injuries. I am 65 years old.`, "risk:"],
  ["age 15", `${base}, no injuries. I'm 15.`, "risk:"],
  ["ES age", "Soy principiante, ganar fuerza, 3 días por semana en gimnasio, sin lesiones, tengo 67 años.", "risk:"],
  ["eating behavior", `${base}, no injuries. I need to burn off everything I ate.`, "risk:"],
  ["rapid weight loss", "Beginner, no injuries, 3 days a week at the gym. I want to lose 20 pounds in 3 weeks.", "risk:"],
  ["sport goal", "Beginner, no injuries, 3 days a week at the gym, training for a marathon.", "risk:"],
  ["my back mention", `${base}, no injuries, I want to build my back.`, "risk:"],
  ["not confirmed beginner", "I want to build muscle, 3 days a week at a full gym, no injuries.", "missing:beginner"],
  ["injuries not confirmed", "I'm a beginner, build muscle, 3 days a week at a full gym.", "missing:no_injury"],
  ["days missing", "I'm a beginner, build muscle, full gym, no injuries.", "missing:days"],
  ["4 days", "I'm a beginner, build muscle, 4 days a week at a full gym, no injuries.", "days:"],
  ["5 days", "I'm a beginner, build muscle, 5 days a week at a full gym, no injuries.", "days:"],
  ["1 day", "I'm a beginner, build muscle, 1 day a week at a full gym, no injuries.", "days:"],
  ["12 days is not parsed as 2", "I'm a beginner, build muscle, 12 days a week at a full gym, no injuries.", "missing:days"],
  ["equipment missing", "I'm a beginner, build muscle, 3 days a week, no injuries.", "missing:equipment"],
  ["gym and home mixed", "I'm a beginner, build muscle, 3 days a week at a gym or dumbbells at home, no injuries.", "equipment:"],
  ["home gym", "I'm a beginner, build muscle, 3 days a week in my home gym, no injuries.", "equipment:"],
  ["bands / kettlebells", "I'm a beginner, build muscle, 3 days a week with kettlebells at home, no injuries.", "equipment:"],
  ["goal missing", "I'm a beginner, 3 days a week at a full gym, no injuries.", "missing:goal"],
  ["intermediate", "I'm intermediate, build muscle, 3 days a week at a full gym, no injuries.", "experience:"],
  ["vague first message", "I want to get in shape", "missing:"],
];
for (const [name, message, prefix] of aiCases) check(`AI: ${name}`, () => expectAi(intake(message), prefix));

check("AI: risk mentioned in an earlier turn still routes to AI", () => {
  expectAi(intake("I'm a beginner, 3 days a week, build muscle, full gym, no injuries", {
    history: [{ role: "user", content: "My lower back has been hurting" }, { role: "assistant", content: '{"status":"gathering","message":"Tell me more"}' }],
  }), "risk:");
});
check("AI: router kill switch", () => {
  process.env.COACH_RULES_ROUTER = "off";
  try { expectAi(intake("I'm a beginner, build muscle, 3 days a week at a full gym, no injuries."), "router:disabled"); }
  finally { delete process.env.COACH_RULES_ROUTER; }
});

// ---- Plan questions -----------------------------------------------------------
const built = buildBeginnerPlanResponse({ units: "lbs", language: "en", goal: "general_fitness", equipment: "gym", daysPerWeek: 3, sessionMinutes: 45 });
const plan = built.plan;
const ask = (mode: CoachRouterInput["mode"], text: string, extra: Partial<CoachRouterInput> = {}): RouteDecision => {
  const input: CoachRouterInput = { mode, units: "lbs", language: "en", currentPlan: plan, ...extra };
  if (mode === "chat") input.question = text;
  if (mode === "update_goals") input.newGoal = text;
  if (mode === "adapt") input.logs = [{ date: "2026-09-21", session_label: "Coach update", exercise_id: "general-update", sets: [], skipped: false, user_note: text }];
  return routeCoachRequest(input);
};
check("view plan (chat)", () => {
  const d = ask("chat", "show my plan");
  expectRules(d, "view_plan");
  if (d.route === "rules" && d.response.status === "reply") assert.match(d.response.message, /Full Body A/);
});
check("view plan arrives through the app's adapt wrapper (text contains 'workout')", () => expectRules(ask("adapt", "show my workout"), "view_plan"));
check("view plan arrives through update_goals wrapper", () => expectRules(ask("update_goals", "what is my schedule"), "view_plan"));
check("ES view plan", () => expectRules(ask("chat", "muéstrame mi plan", { language: "es" }), "view_plan"));
check("'what's my workout'", () => expectRules(ask("chat", "What's my workout?"), "view_plan"));
check("view plan without a plan -> AI", () => expectAi(ask("chat", "show my plan", { currentPlan: null }), "missing:current_plan"));
check("view plan + change request -> AI", () => expectAi(ask("chat", "show my plan but swap the squats"), "question:"));
check("view plan + pain -> AI", () => expectAi(ask("chat", "show my plan, my knee hurts"), "risk:"));
check("structured adapt logs -> AI", () => expectAi(routeCoachRequest({ mode: "adapt", units: "lbs", language: "en", currentPlan: plan, logs: { latest_feedback: {} } }), "mode:"));
check("open-ended question -> AI", () => expectAi(ask("chat", "Should I do yoga on my rest days?"), "question:no_template"));
check("progression rule question", () => {
  const d = ask("chat", "When should I increase the weight?");
  expectRules(d, "progression_rule");
  if (d.route === "rules" && d.response.status === "reply") assert.match(d.response.message, /5 lb/);
});
check("ES progression rule question (kg)", () => {
  const d = ask("chat", "¿Cuándo debo subir el peso?", { language: "es", units: "kg" });
  expectRules(d, "progression_rule");
  if (d.route === "rules" && d.response.status === "reply") assert.match(d.response.message, /2\.5 kg/);
});
check("progression question with pain -> AI", () => expectAi(ask("chat", "Should I go heavier? my shoulder hurts"), "risk:"));

// ---- Template validity across every combination ---------------------------------
check("all template combinations are valid, conservative and consistent", () => {
  const equipments: BeginnerEquipment[] = ["gym", "home_dumbbells", "bodyweight"];
  const goals: BeginnerGoal[] = ["general_fitness", "fat_loss", "hypertrophy", "strength"];
  let count = 0;
  for (const equipment of equipments) for (const goal of goals) for (const days of [2, 3] as const) for (const minutes of [30, 60]) {
    const en = buildBeginnerPlanResponse({ units: "kg", language: "en", goal, equipment, daysPerWeek: days, sessionMinutes: minutes });
    const es = buildBeginnerPlanResponse({ units: "lbs", language: "es", goal, equipment, daysPerWeek: days, sessionMinutes: minutes });
    for (const r of [en, es]) {
      count++;
      const tag = `${equipment}/${goal}/${days}d/${minutes}m`;
      assert.ok(isPlan(r.plan), `${tag}: not a valid Plan`);
      assert.equal(r.plan.sessions.length, days, tag);
      assert.equal(new Set(r.plan.sessions.map((s) => s.day_label)).size, days, `${tag}: duplicate day labels`);
      const allIds = r.plan.sessions.flatMap((s) => s.exercises.map((e) => e.exercise_id));
      assert.equal(new Set(allIds).size, allIds.length, `${tag}: exercise_id repeats across the plan`);
      assert.equal(r.plan.experience_level, "beginner");
      for (const session of r.plan.sessions) {
        assert.ok(session.exercises.length >= 4 && session.exercises.length <= 5, `${tag}: ${session.exercises.length} exercises`);
        assert.equal(new Set(session.exercises.map((e) => e.exercise_id)).size, session.exercises.length, `${tag}: duplicate exercise in a session`);
        for (const e of session.exercises) {
          assert.ok(e.sets >= 2 && e.sets <= 3, `${tag}: sets ${e.sets}`);
          assert.ok(e.target_rpe !== null && e.target_rpe <= 7, `${tag}: RPE ${e.target_rpe}`);
          const isCore = e.name === "Dead Bug" || e.name === "Bird Dog" || e.name === "Bicho muerto" || e.name === "Perro de caza";
          assert.deepEqual([e.rep_range.min, e.rep_range.max], isCore ? [6, 10] : [8, 12], `${tag}: beginner reps for ${e.name}`);
          if (equipment === "bodyweight") assert.match(e.target_load, /^(Bodyweight|Peso corporal)\.$/, `${tag}: bodyweight plan has a loaded move (${e.name})`);
        }
      }
    }
    // Stable ids across languages so history keeps matching.
    const ids = (r: typeof en) => r.plan.sessions.map((s) => s.exercises.map((e) => e.exercise_id).join(","));
    assert.deepEqual(ids(en), ids(es), `${equipment}/${goal}/${days}d ids differ by language`);
    // Unit-appropriate increments.
    const loaded = en.plan.sessions.flatMap((s) => s.exercises).find((e) => /Add weight/.test(e.progression_rule) && /kg/.test(e.progression_rule) && /10%/.test(e.progression_rule));
    if (equipment !== "bodyweight") assert.ok(loaded, `${equipment}: kg increment missing`);
    if (equipment !== "bodyweight") assert.ok(es.plan.sessions.flatMap((s) => s.exercises).some((e) => /5 lb/.test(e.progression_rule) && /10 %/.test(e.progression_rule)), "lbs increment / 10% cap missing");
  }
  assert.equal(count, 3 * 4 * 2 * 2 * 2);
});


// ---- Stage two: ongoing coaching ---------------------------------------------------------
const msg = (d: RouteDecision): string => {
  assert.equal(d.route, "rules", d.route === "ai" ? `went to AI: ${d.reason}` : "");
  if (d.route !== "rules") return "";
  return d.response.status === "reply" ? d.response.message : d.response.status === "plan_updated" ? d.response.summary : "";
};
const gymPlan = plan;
const homePlan = buildBeginnerPlanResponse({ units: "kg", language: "en", goal: "hypertrophy", equipment: "home_dumbbells", daysPerWeek: 3, sessionMinutes: 45 }).plan;
const bodyPlan = buildBeginnerPlanResponse({ units: "kg", language: "en", goal: "fat_loss", equipment: "bodyweight", daysPerWeek: 2, sessionMinutes: 45 }).plan;

// Progression: two sessions at the top of range OR two extra reps for two weeks; 10% cap.
check("progression rule states both triggers and the ~10% cap", () => {
  const d = ask("chat", "When should I increase the weight?");
  expectRules(d, "progression_rule");
  const m = msg(d);
  assert.match(m, /2 sessions in a row/); assert.match(m, /2 extra reps/); assert.match(m, /2 weeks straight/); assert.match(m, /10%/); assert.match(m, /5 lb/);
});
check("progression: 'how much weight should I add'", () => expectRules(ask("chat", "How much weight should I add next time?"), "progression_rule"));
check("progression ES (kg)", () => { const d = ask("chat", "¿Cuándo debo subir el peso?", { language: "es", units: "kg" }); expectRules(d, "progression_rule"); assert.match(msg(d), /10 %/); });
check("progression with pain -> AI", () => expectAi(ask("chat", "Should I go heavier? my shoulder hurts"), "risk:"));

// Difficulty
check("too hard -> hold weights, no increases", () => { const d = ask("adapt", "This workout was too hard"); expectRules(d, "difficulty_feedback"); assert.match(msg(d), /no increases/); });
check("too easy -> check the rule, do not add sets", () => { const d = ask("chat", "The workout feels too easy"); expectRules(d, "difficulty_feedback"); assert.match(msg(d), /more is not better/); });
check("'too easy, should I add weight?' is one intent", () => expectRules(ask("chat", "It's too easy, should I increase the weight?"), "difficulty_feedback"));
check("too hard + a body part -> AI", () => expectAi(ask("chat", "The workout was too hard on my knee"), "risk:"));
check("conflicting difficulty -> AI", () => expectAi(ask("chat", "some parts too hard and some too easy"), "difficulty:"));

// Missed workouts: <7 days none; 7-20 partial; 21+ ease back in.
const missed = (text: string, language: "en" | "es" = "en") => msg(ask("adapt", text, { language }));
check("missed <7 days: no adjustment", () => { assert.match(missed("I missed 3 days"), /no adjustment needed/i); assert.match(missed("I missed a workout"), /no adjustment needed/i); });
check("missed 7-20 days: first session lighter", () => {
  assert.match(missed("I've been away for 10 days"), /About 10 days away.*10% less weight/);
  assert.match(missed("I took two weeks off"), /About 14 days away/);
  assert.match(missed("I missed a week of workouts"), /About 7 days away/);
  assert.match(missed("I skipped my workouts for 20 days"), /About 20 days away/);
});
check("missed 3+ weeks: ease back in", () => {
  for (const t of ["I haven't trained in 3 weeks", "I haven't trained in 4 weeks", "I haven't worked out in a month", "I missed a month of training"]) assert.match(missed(t), /ease back in/i, t);
  assert.match(missed("I haven't trained in 4 weeks"), /Week 1.*Week 2.*Week 3/);
});
check("missed ES", () => { assert.match(missed("no he entrenado en 3 semanas", "es"), /reincorpórate/); assert.match(missed("Falté 3 días", "es"), /no hace falta ningún ajuste/); });
check("missed without duration -> guide with all tiers", () => assert.match(missed("I missed some workouts"), /Under a week.*One to three weeks.*More than three weeks/));
check("missed because of illness/injury -> AI", () => {
  expectAi(ask("adapt", "I missed two weeks because I was sick"), "risk:");
  expectAi(ask("adapt", "I skipped workouts after I got injured"), "risk:");
});

// Soreness
check("normal soreness gets the templated reassurance", () => {
  for (const t of ["My legs are sore after yesterday's workout", "My quads are sore for 2 days", "I have some muscle soreness"]) {
    const d = ask("chat", t); expectRules(d, "soreness"); assert.match(msg(d), /day 2.*day 3-4/);
  }
});
check("soreness ES", () => expectRules(ask("chat", "Estoy adolorido después de entrenar", { language: "es" }), "soreness"));
check("soreness escalates: >5 days", () => { expectAi(ask("chat", "my legs have been sore for 6 days"), "soreness:escalate_duration"); expectAi(ask("chat", "still sore after a week"), "soreness:escalate_duration"); });
check("soreness escalates: sharp / swelling / getting worse", () => {
  expectAi(ask("chat", "my chest is sore and swollen")); // caught by the risk screen before soreness rules
  expectAi(ask("chat", "sharp soreness in my quad"), "soreness:escalate_symptoms");
  expectAi(ask("chat", "the soreness is getting worse"), "soreness:escalate_symptoms");
});
check("soreness at a joint -> AI", () => expectAi(ask("chat", "my knee is sore"), "risk:"));

// Volume / frequency: never push toward more.
check("more sets/days -> beginner guidance, no push toward more", () => {
  for (const t of ["Should I add more sets?", "Can I train every day?", "Should I add an extra day?", "Is this enough?"]) {
    const d = ask("chat", t); expectRules(d, "frequency_volume");
    const m = msg(d); assert.match(m, /2-3 sessions/); assert.match(m, /1-3 sets/); assert.match(m, /8-12 reps/); assert.match(m, /more is not better/);
  }
});
check("frequency question on a non-beginner plan -> AI", () => expectAi(ask("chat", "Should I add more sets?", { currentPlan: { ...gymPlan, experience_level: "intermediate" } }), "frequency:"));

// Why this exercise
check("why: brief reason tied to the goal", () => {
  const d = ask("chat", "Why is leg press in my plan?"); expectRules(d, "why_exercise");
  assert.match(msg(d), /quads and glutes/); assert.match(msg(d), /general fitness/);
  const d2 = ask("chat", "why do I do the dead bug", { currentPlan: { ...gymPlan, goal_type: "strength" } }); expectRules(d2, "why_exercise"); assert.match(msg(d2), /stronger/);
});
check("why ES", () => { const d = ask("chat", "¿Por qué hago sentadilla goblet?", { language: "es", currentPlan: buildBeginnerPlanResponse({ units: "lbs", language: "es", goal: "hypertrophy", equipment: "gym", daysPerWeek: 3, sessionMinutes: 45 }).plan }); expectRules(d, "why_exercise"); assert.match(msg(d), /ganar músculo/); });
check("why with no exercise named or an ambiguous one -> AI", () => { expectAi(ask("chat", "why do I do this exercise"), "why:"); expectAi(ask("chat", "why is squat in my plan"), "why:"); });

// Substitution: same movement pattern AND available equipment; discourage over-swapping.
const kinds = (d: RouteDecision) => (d.route === "rules" && d.response.status === "plan_updated" ? d.response.plan : null);
check("cannot-do / no-equipment: closest match by pattern and equipment, no 'keep it' contradiction", () => {
  const d = ask("chat", "I don't have a leg press");
  expectRules(d, "substitution"); const m = msg(d);
  assert.match(m, /If you cannot do Leg Press/); assert.match(m, /Goblet Squat/); assert.match(m, /squat pattern/);
  assert.doesNotMatch(m, /best move is to keep/); assert.doesNotMatch(m, /Chest Press|Row|Pulldown/);
});
check("voluntary swap question nudges to keep the exercise", () => {
  const d = ask("chat", "What can I use instead of leg press?");
  expectRules(d, "substitution"); const m = msg(d);
  assert.match(m, /keep Leg Press for the whole block/); assert.match(m, /Sticking with the same exercises/); assert.match(m, /Goblet Squat/);
});
check("a row is not offered for a pulldown (different pattern) -> AI", () => expectAi(ask("chat", "I can't do lat pulldown"), "substitution:no_compatible_option"));
check("explicit compatible swap is applied to the plan, prescription kept", () => {
  const d = ask("chat", "swap leg press for goblet squat"); expectRules(d, "swap_applied");
  const next = kinds(d)!; assert.ok(next && isPlan(next));
  const all = next.sessions.flatMap((s) => s.exercises);
  assert.ok(!all.some((e) => e.name === "Leg Press"), "old exercise still present");
  assert.equal(new Set(all.map((e) => e.exercise_id)).size, all.length, "ids not unique");
  const before = gymPlan.sessions[0].exercises[0]; const after = next.sessions[0].exercises[0];
  assert.equal(after.name, "Goblet Squat"); assert.equal(after.sets, before.sets); assert.deepEqual(after.rep_range, before.rep_range);
  assert.match(msg(d), /same squat pattern/);
});
check("swap across patterns is refused with a reason and fitting options", () => {
  const m = msg(ask("chat", "swap leg press for bench press")); assert.match(m, /different movement pattern/); assert.match(m, /Goblet Squat/);
});
check("swap needing equipment the plan lacks is refused", () => {
  assert.match(msg(ask("chat", "replace goblet squat with leg press", { currentPlan: homePlan })), /equipment your plan does not include/);
  assert.match(msg(ask("chat", "swap incline push up for dumbbell bench press", { currentPlan: bodyPlan })), /equipment your plan does not include/);
});
check("swap to an exercise outside the library -> AI", () => expectAi(ask("chat", "swap leg press for wall sit"), "substitution:target_unknown"));
check("swap of an ambiguous or unknown exercise -> AI", () => { expectAi(ask("chat", "swap the squats for lunges"), "substitution:"); expectAi(ask("chat", "I can't do burpees"), "substitution:"); });
check("boredom gets a keep-it answer", () => { const d = ask("chat", "I'm bored of my workouts"); expectRules(d, "substitution"); assert.match(msg(d), /repeating the same exercises/); });
check("swap ES", () => { const d = ask("chat", "cambia prensa de piernas por sentadilla goblet", { language: "es" }); expectRules(d, "swap_applied"); });

// Nutrition
check("protein range (and personalised when body weight is given)", () => {
  assert.match(msg(ask("chat", "How much protein do I need?")), /1\.6-2\.2 grams/);
  assert.match(msg(ask("chat", "I weigh 80 kg, how much protein should I eat?")), /130-175 g a day for 80 kg/);
  assert.match(msg(ask("chat", "I weigh 180 lbs how much protein?")), /130-180 g a day for 82 kg/);
});
check("meal timing: no strict 1-hour window, total daily intake framed as what matters most", () => {
  const m = msg(ask("chat", "What should I eat before and after training?"));
  assert.match(m, /1-4 hours before/); assert.match(m, /whole day/); assert.doesNotMatch(m, /within about 1 hour after/);
});
check("creatine: 3-5 g, no loading", () => { const m = msg(ask("chat", "How much creatine should I take?")); assert.match(m, /3-5 grams/); assert.match(m, /do not need a loading phase/); });
check("caffeine: 400 mg, avoid late", () => { const m = msg(ask("chat", "How much caffeine is too much?")); assert.match(m, /400 mg/); assert.match(m, /early afternoon/); });
check("several nutrition topics answered together", () => { const m = msg(ask("chat", "Can I take creatine and protein?")); assert.match(m, /3-5 grams/); assert.match(m, /1\.6-2\.2/); });
check("nutrition ES", () => { const d = ask("chat", "¿Cuánta creatina debo tomar?", { language: "es" }); expectRules(d, "nutrition"); assert.match(msg(d), /3-5 gramos/); });
check("nutrition escalations: medical, medication, minors, pregnancy -> AI", () => {
  for (const t of ["I take medication, is creatine ok?", "I'm 16, can I take creatine?", "I'm pregnant, how much caffeine can I have?", "I have kidney problems, how much protein?", "I have anxiety, is caffeine ok?", "Is creatine ok with my blood pressure pills?"]) expectAi(ask("chat", t), "risk:");
});
check("nutrition out of scope (calories, diets, other supplements) -> AI", () => {
  for (const t of ["how many calories should I eat for protein", "creatine and pre workout", "is keto good with creatine"]) expectAi(ask("chat", t), "nutrition:out_of_scope");
  expectAi(ask("chat", "Are fat burners worth it?"), "nutrition:out_of_scope");
});

// Multi-intent and precedence
check("two intents in one message -> AI", () => { expectAi(ask("chat", "my legs are sore, should I add more sets?"), "question:multiple_intents"); expectAi(ask("chat", "show my plan and how much protein"), "question:multiple_intents"); });
check("risk screen runs before every stage-two template", () => {
  for (const t of ["How much protein? I have diabetes", "I missed 3 days, my back hurts", "why is leg press in my plan, my knee hurts", "should I add more sets, I'm 62 years old"]) expectAi(ask("chat", t), "risk:");
});

check("soreness after a workout is not mistaken for a meal-timing question", () => {
  expectRules(ask("chat", "I'm sore after a workout"), "soreness");
  expectRules(ask("chat", "estoy adolorido después de entrenar", { language: "es" }), "soreness");
});

// Adversarial sweep: risky wording across every stage-two intent must reach the AI.
check("adversarial sweep: nothing risky is answered from templates", () => {
  const risky: Array<[string, "en" | "es"]> = [
    ["my back is sore and I can't straighten it", "en"], ["I feel dizzy when I lift", "en"], ["chest tightness after squats, how much protein?", "en"],
    ["leg swelling after workouts", "en"], ["pain when I squat, what can I use instead?", "en"], ["tingling in my arm after the workout", "en"],
    ["I had a C-section 8 weeks ago, how much protein?", "en"], ["I'm 70, how much creatine?", "en"], ["how much creatine can my son take?", "en"],
    ["protein for my teenage daughter", "en"], ["I'm diabetic, how much protein?", "en"], ["sore for 2 weeks and getting worse", "en"],
    ["I fainted after training, should I add more sets?", "en"], ["my ribs hurt, should I skip workouts?", "en"], ["I'm on antidepressants, can I have caffeine?", "en"],
    ["is creatine safe with my thyroid medication?", "en"], ["I missed a month because of surgery", "en"], ["why is leg press in my plan? my hip clicks", "en"],
    ["I want to skip meals and train harder, protein?", "en"], ["I feel guilty when I miss a workout, I need to burn it off", "en"],
    ["I'm 15, how much protein?", "en"], ["I'm 64 and sore after workouts", "en"], ["I had a concussion, can I train?", "en"],
    ["me duele la rodilla al hacer sentadillas", "es"], ["estoy embarazada, ¿cuánta cafeína puedo tomar?", "es"], ["tengo diabetes, ¿cuánta proteína necesito?", "es"],
    ["mi hijo de 15 años quiere creatina", "es"], ["me mareo al entrenar", "es"], ["falté dos semanas por una cirugía", "es"],
    ["tengo la presión alta, ¿puedo tomar cafeína?", "es"], ["estoy adolorido y tengo hinchazón en la pierna", "es"], ["me siento culpable si descanso y quiero quemar todo lo que como", "es"],
  ];
  for (const [text, language] of risky) {
    for (const mode of ["chat", "adapt", "update_goals"] as const) {
      const d = ask(mode, text, { language });
      assert.equal(d.route, "ai", `${mode}: "${text}" was answered by rules (${d.route === "rules" ? d.intent : ""})`);
    }
  }
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall passed");

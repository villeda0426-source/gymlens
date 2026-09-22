# Coach rules-first router

Routine Coach requests are answered from templates in milliseconds; everything else goes to the existing AI pipeline unchanged (prompt, retries, fallback model, guardrails). The bias is fail-safe: rules run only when every condition is positively met.

Code: `coachRouter.ts` (risk screen + intake routing), `coachIntents.ts` (ongoing-coaching matchers, swap logic), `coachKnowledge.ts` (the guidance numbers and reply text), `coachTemplates.ts` (beginner plans, exercise library), `coachText.ts` (normalization); wired in `server/routes/coach-trainer.ts` (`routePayload`, `runCoachRequest`, `POST /jobs`). All under `server/services/`.

## Stage one: plan creation

`beginner_plan` (intake): rules only when the conversation confirms all of: beginner, "no injuries/limitations", **2-3 days/week**, one clear equipment type (full gym / dumbbells at home / bodyweight), a clear goal, and no risk signal in any turn. Template plan: first week, 2-3 sets, **8-12 reps** (core 6-10 per side), RPE 6, EN/ES, kg/lbs. Requests for 4+ days go to the AI (the router never nudges beginners toward more, and the AI honors what they asked for).

## Stage two: ongoing coaching

Every number lives in `coachKnowledge.ts` constants (`PROGRESSION`, `BEGINNER_VOLUME`, `MISSED_WORKOUTS`, `SORENESS`, `NUTRITION`).

| Intent | What it answers | Rule |
|---|---|---|
| `progression_rule` | when to add weight | Add weight after **2 sessions in a row at the top of the rep range with good form, OR 2 extra reps beyond target for 2 weeks straight**. Smallest jump available, **capped ~10%** per step (add a rep if the smallest jump is bigger). Weight or reps, not both. |
| `difficulty_feedback` | "too hard" / "too easy" | Hard: hold weights, cut a set or ~10% load, RPE 6-7. Easy: check the progression rule, add reps first, never extra sets/days. |
| `missed_workout` | time away | **< 7 days: no adjustment. 7-20 days: first session ~10% lighter. 3+ weeks: ease back in** (wk 1 ~20% lighter, one fewer set; wk 2 ~10% lighter; wk 3 normal). No duration given: shows all three tiers. |
| `soreness` | normal DOMS | Peaks ~day 2, eases by day 3-4: reassure. **Sharp, swelling, worsening, or > 5 days: AI.** |
| `frequency_volume` | "should I do more?" | Beginners: 2-3 sessions/week, 1-3 sets, 8-12 reps; more is not better early on. Non-beginner plans: AI. |
| `substitution` | "I can't do X" / "instead of X" | Options match **movement pattern AND available equipment** (not muscle label). Voluntary swaps get a "keep the same exercises: coordination and confidence" nudge. |
| `swap_applied` | "swap X for Y" | Applied only when Y matches X's pattern and the plan's equipment; keeps sets/reps; unique exercise ids. A mismatch gets a reason and fitting options. Unknown exercises: AI. |
| `why_exercise` | "why is X in my plan" | One plain-language reason (movement pattern) tied to the plan's goal. |
| `nutrition` | protein, meal timing, creatine, caffeine | Protein 1.6-2.2 g/kg (personalised if body weight is stated); carbs+protein 1-4 h before training, then protein sometime in the hours after (no strict 1-hour window; only calls out 2-4 h if training fasted); creatine 3-5 g/day, no loading; caffeine up to ~400 mg/day, avoid after early afternoon. |
| `view_plan`, `progression_rule` | (stage one carry-over) | Lists the current plan / states the rule. |

Reply-only intents never change the plan. `swap_applied` is the one plan change, and only on an explicit "swap X for Y" from the user.

## What always goes to the AI

A risk screen runs first on every message and turn: injury, pain, symptoms (dizziness, chest tightness, numbness...), medical conditions, medication, surgery/rehab, pregnancy/postpartum, mental-health/stimulant medication, illness, eating or rapid-weight-loss language, age under 18 or over 59 (including "my son/daughter", "teenager"), and sport/competition goals. After that, the AI also gets: messages matching **no** template, **more than one** intent, calorie/diet/macro/other-supplement questions, exercises not in the library, ambiguous exercise references, and non-beginner volume questions.

## Operations

- Kill switch: `COACH_RULES_ROUTER=off` on the server sends everything to the AI.
- Rules-handled jobs complete before `POST /jobs` responds.
- Metrics (metadata only, never message text): `[coach-router]` log line, and `coach_trainer_jobs.timings.rulesHandled` / `routeReason`. The most common `routeReason` values for AI-routed messages show which rules to tune.

## Checks (offline, no AI, no network)

```
node_modules/.bin/ts-node scripts/check-coach-router.ts        # routing, every intent, escalations, adversarial sweep, template validity
node_modules/.bin/ts-node scripts/check-coach-route-rules.ts   # real Express route, rules paths
```
The paid AI baselines (`coach-safety-baseline.ts`, `coach-quality-baseline.ts`) still test the AI path directly.

## Source check (2026-09-21)

The numeric claims above were checked against current sports-science sources after the templates were written.

| Claim | Verdict | Note |
|---|---|---|
| Protein 1.6-2.2 g/kg for muscle-focused goals | Supported | Matches Morton et al. 2018 meta-regression (Br J Sports Med), the range cited by modern strength-and-nutrition sources; overlaps the ISSN 2017 position stand's 1.4-2.0 g/kg. |
| "Protein within about 1 hour after training" | **Fixed** | Overstated. ISSN nutrient-timing position stand and Schoenfeld's meta-analysis found no hypertrophy benefit to eating within 1 hour vs. several hours later when a pre-workout meal was eaten and total daily protein was adequate; the window is 2-6 h, not a hard 60-minute cutoff. Reworded to lead with total daily intake and only mention a 2-4 h post-workout target for training fasted. |
| Creatine 3-5 g/day, no loading phase | Supported | Matches the ISSN position stand directly. |
| Caffeine ~400 mg/day upper zone, avoid after early afternoon | Supported | Matches FDA/EFSA guidance and sleep research on a 6-8 h pre-bedtime cutoff. |
| Beginner volume: 2-3 sessions/week, 1-3 sets, 8-12 reps | Supported | Matches the ACSM 2009 position stand and NSCA beginner guidance; the 2026 ACSM update is more flexible ("at least twice a week") but does not contradict it. |
| Progression: 2 sessions at the top of the rep range | Supported | This is the standard "double progression" method used across mainstream strength coaching. |
| ~10% cap on a single load jump | Supported | Matches the commonly cited "10% rule" for progressive overload (usually framed as a weekly rate; used here per jump, which is the more conservative reading). |
| Missed workouts: <7 days none, ease in from 3+ weeks | Supported | Matches detraining research: beginners show only small strength loss under ~3 weeks, with losses becoming clear by 3-4 weeks and returning faster than they were built. |
| Soreness: peaks day 2, eases day 3-4, escalate after 5 days | Supported, cautious | Peak day 2 and easing by day 3-4 sit inside the documented range (peak 24-72 h, clear improvement by day 4-5); escalating at day 5 is earlier than the typical 6-7 day full resolution, which is intentionally cautious rather than wrong. |

Not independently re-verified: the exact `MISSED_WORKOUTS` percentages (10% / 20% / 10%) are a reasonable interpolation of the detraining literature rather than numbers tied to a specific study; review them against your own source if you have one in mind.

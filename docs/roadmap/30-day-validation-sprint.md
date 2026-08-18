# SpotLift 30-Day Validation Sprint

Sprint window: begins on the first business day after iOS 1.0.7 is approved  
Sprint objective: produce enough reliable evidence to choose the next product, growth, and monetization priorities.

## Definition of sprint success

By day 30, SpotLift must have:

- a verified activation funnel;
- a weekly reliability and AI-cost baseline;
- evidence from at least ten observed user journeys;
- structured quality results for at least 20 Coach plans;
- at least ten attributable founder-led creative tests;
- a written decision on the next 30-day investment.

## Pre-sprint — while Apple review is pending

| ID | Work item | Status | Owner | Evidence / completion rule |
|---|---|---|---|---|
| P-01 | Monitor App Store review | WAITING | Founder + Codex | Status and any Apple message recorded |
| P-02 | Finalize analytics event dictionary | NEXT | Codex | Event names, triggers, required properties, privacy classification |
| P-03 | Confirm Sentry build 43 release mapping | NEXT | Codex | `spotlift@1.0.7`, dist `43`, production event visible |
| P-04 | Define test-user recruitment list | NEXT | Founder | 10 candidates: beginners, returning users, and 2–3 active lifters |
| P-05 | Prepare test scripts | NEXT | Codex | Activation and Coach-quality scripts ready |

## Week 1 — Measurement and release health

Goal: know what users do and whether the system works.

### Product analytics

- Instrument and verify the events in the event dictionary.
- Confirm anonymous-to-authenticated identity handling does not duplicate users.
- Attach `platform`, `app_version`, `build_number`, `locale`, and acquisition fields when available.
- Verify a complete internal journey appears in the correct order.
- Create baseline queries for activation conversion and time-to-value.

### Reliability

- Verify crash-free sessions in Sentry.
- Record production API dependency health daily for the first release week.
- Track Coach request success, failure class, and latency.
- Confirm account deletion succeeds on a sacrificial test account.
- Categorize every failure as client, authentication, API, database, OpenAI, YouTube, or unknown.

### AI economics

- Aggregate `ai_usage_events` by feature and model.
- Record input tokens, output tokens, success rate, and latency.
- Apply current OpenAI model prices outside the app so pricing can be updated without a release.
- Calculate estimated cost per plan, scan, coaching exchange, completed first workout, and activated user.

### Week 1 exit gate

- One real or controlled user produces a complete, visible funnel.
- Crash and API measurements are available by build 43.
- No critical metric is silently missing; missing sources are explicitly named.

## Week 2 — Coaching quality and full-loop verification

Goal: prove that Coach continuity works beyond plan generation.

### Scenario matrix

Test at least these cases:

1. First-time gym user, 3 days/week, general fitness.
2. Returning user, 4 days/week, strength goal.
3. Weight-loss goal with a short workout window.
4. Home-gym user with limited equipment.
5. Commercial gym user requesting machines only.
6. User with a stated knee limitation.
7. User reporting pain during a workout.
8. User who misses a workout week.
9. User who completes week one and provides feedback.
10. User who completes the entire plan and requests the next plan.

Run variants across English and Spanish until at least 20 plans are evaluated.

### Score each plan

Use a 1–5 scale for:

- goal alignment;
- schedule/equipment fit;
- progression logic;
- safety and limitation handling;
- clarity;
- exercise-card completeness;
- conversation/plan linkage;
- feedback adaptation;
- Spanish quality where applicable.

Also record binary outcomes:

- JSON valid;
- saved successfully;
- app remained responsive;
- workout completion registered;
- week checkpoint appeared at the correct time;
- full-plan feedback appeared at the correct time;
- next plan was created and linked to the same coaching thread.

### Week 2 exit gate

- At least 20 scored plans.
- All critical failures have reproducible steps.
- The highest-value coaching improvement is selected by frequency × severity × north-star impact.

## Week 3 — User validation

Goal: observe real beginner behavior rather than relying on founder familiarity.

### Recruitment mix

- 5 gym beginners or people returning after a long break.
- 3 casual gym users.
- 2 active lifters who can identify confusing or unsafe guidance.

### Session script

Ask the user to:

1. Install/open SpotLift without coaching from the founder.
2. Explain what they believe the app does.
3. Sign in.
4. Scan or search a machine.
5. inspect muscles, tutorial, safety, and YouTube guidance.
6. Create a Coach plan.
7. Open and complete a representative workout.
8. Explain what they expect to happen next.
9. Find the associated Coach conversation again.
10. Rate trust, usefulness, confusion, and willingness to return.

Do not lead users toward the correct control. Record hesitation, wrong turns, abandonment, and exact phrases.

### Week 3 exit gate

- Ten sessions completed or a documented recruitment blocker.
- Friction is grouped by activation stage and severity.
- At least five direct user quotes support or contradict the current positioning.

## Week 4 — Demand test and investment decision

Goal: connect market messages to qualified product behavior.

### Creative test structure

Test ten concepts, each with an attributable link where possible. Prioritize:

- “I pay for a gym but still don't know what to do.”
- “Scan any machine before you guess.”
- “Your first 90 days at the gym shouldn't feel random.”
- “A trainer-like plan without paying for basic machine explanations.”
- “Finish a workout and let your next plan remember it.”

Each asset records format, hook, CTA, publish time, reach/views, saves, shares, comments, profile visits, link clicks, downloads, and activated users when available.

### Day-30 decision

Choose exactly one primary investment for the next sprint:

- activation/onboarding;
- coaching quality/continuity;
- reliability;
- retention/re-engagement;
- attributable organic growth;
- monetization experiment.

The decision must cite the scorecard and user evidence. “Build more features” is not a valid category.

## Active issue register

| Issue | Severity | Status | Success condition |
|---|---:|---|---|
| Apple review outcome for build 43 | External | WAITING | Approved and publicly released |
| Product event funnel not yet verified | P0 | NEXT | Complete test journey visible end to end |
| Retention baseline unavailable | P1 | NEXT | D1/D7 cohorts measurable for two weeks |
| AI cost per activated user unknown | P1 | NEXT | Token usage joined to activation cohort |
| Test-user panel not recruited | P1 | NEXT | Ten sessions scheduled or completed |


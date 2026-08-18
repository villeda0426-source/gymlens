# SpotLift Operating Roadmap

Last updated: August 17, 2026  
Current release: iOS 1.0.7 build 43 — submitted to Apple, awaiting review  
Roadmap owner: Founder  
Execution partner: Codex

## How to use this folder

This is SpotLift's operating system. It is deliberately separate from product code and from long chat histories.

1. Start here for the current phase, priorities, and definition of success.
2. Use [30-day-validation-sprint.md](./30-day-validation-sprint.md) for the active work board.
3. Update [weekly-scorecard.md](./weekly-scorecard.md) every Monday with verified numbers.
4. Record important product and business choices in [decision-log.md](./decision-log.md).
5. Use [event-dictionary.md](./event-dictionary.md) as the authoritative analytics contract.
6. Read [coach-quality-baseline-2026-08-17.md](./coach-quality-baseline-2026-08-17.md) for the first controlled Coach results.
7. Do not mark an item complete without linking or naming the evidence.

Status vocabulary:

- `WAITING`: dependent on an external party or elapsed time.
- `NEXT`: ready to start and among the next three priorities.
- `IN PROGRESS`: actively being executed.
- `BLOCKED`: cannot move without a named input or permission.
- `DONE`: exit criteria met and evidence recorded.
- `PARKED`: intentionally deferred with a reason.

## North-star outcome

A new user completes one useful, personalized workout and receives a saved next-plan recommendation within 72 hours of installing SpotLift.

This measures the complete promise—not merely an install, account, scan, or generated plan.

North-star event definition:

```text
new user
  → creates or accepts a personalized plan
  → completes the plan's first workout
  → sees or saves the next recommendation
  → all within 72 hours of first app open
```

## Strategic position

SpotLift should own “machine confidence” for gym beginners and returning gym-goers:

> Scan or search the machine in front of you, learn how to use it safely, and get a workout plan that remembers what happened next.

The product should not compete as a generic AI chat app. Its advantage is the connected journey between the physical machine, trusted instruction, a personalized plan, completed workout history, and the next useful coaching decision.

## Current phase

### Phase 0 — Release and review

Status: `WAITING`

Completed:

- iOS 1.0.7 build 43 built successfully.
- Build 43 uploaded to App Store Connect and submitted for review.
- Guideline 5.1.1(v) account-deletion issue addressed with in-app deletion and server-side data removal.
- Production API, dependency health, equipment search, YouTube videos, workout guide, legacy guide route, and Coach smoke tests passed.
- Release source preserved on `codex/app-store-build-43` at commit `5272084`.

Remaining:

- Wait for Apple review.
- Respond if Apple requests clarification or demonstrates a reproducible defect.
- After approval, record release date and set the production latest-build policy to 43.

Exit criteria:

- Version 1.0.7 is publicly available on the App Store.
- No release-blocking crash or authentication defect appears during the first 72 hours.
- Build 43 is identified correctly in crash, API, and product analytics.

### Phase 1 — Measurement and activation

Status: `NEXT`

Objective: establish a trustworthy baseline before making growth or monetization decisions.

Required capabilities:

- A defined event dictionary for the full activation funnel.
- Product events segmented by app version, build, platform, and acquisition source when available.
- Crash-free sessions and API reliability visible weekly.
- OpenAI usage and estimated cost visible by feature.
- App Store impressions, page views, downloads, and conversion recorded weekly.
- Ten observed first-user journeys with friction categorized.

Exit criteria:

- Two consecutive weeks of usable funnel data.
- No unknown gaps between plan creation, workout completion, and next recommendation.
- A baseline exists for activation, retention, reliability, and AI unit economics.
- The next product experiment is selected using evidence rather than preference.

### Phase 2 — Coaching-quality validation

Status: `NEXT`

Objective: prove that the Coach is useful, safe, continuous, and economically sustainable.

Quality dimensions:

- Plan relevance to goals, schedule, experience, limitations, and equipment.
- Exercise safety and appropriate regressions.
- Consistency between the Coach conversation and saved workout plan.
- Successful completion feedback at the end of a week and full plan.
- Correct creation of a next plan from history and feedback.
- Clear explanations of what changed and why.

Exit criteria:

- At least 20 structured plan reviews across representative beginner scenarios.
- At least 90% valid JSON/plan creation without manual recovery.
- At least 90% successful full-plan feedback-to-next-plan transitions in controlled testing.
- Safety-sensitive scenarios are escalated or constrained appropriately.
- Median AI cost per activated user is known.

### Phase 3 — Founder-led demand validation

Status: `PARKED` until Phase 1 has a working attribution baseline.

Objective: find repeatable messages that attract qualified beginners—not vanity engagement.

Primary content promise:

> Walk into the gym knowing exactly what to do.

Measure saves, shares, beginner-intent comments, profile visits, link clicks, attributed downloads, activation, and repeatability. Likes alone never determine a winner.

Exit criteria:

- Ten distinct creative concepts tested with attributable links.
- At least two repeatable concepts outperform the four-week baseline on conversion intent.
- Landing/store promise matches the winning user pain.
- Paid promotion is limited to organically validated concepts.

### Phase 4 — Monetization validation

Status: `PARKED` until activation and AI unit cost are measured.

Paid value should be continuity, adaptation, accountability, and progress interpretation—not basic access to safe machine information.

Exit criteria before scaling:

- Free allowance has a known marginal cost.
- Paid conversion and trial-to-paid behavior are measurable.
- Contribution LTV:CAC is expected to be at least 3:1.
- Refund, cancellation, and safety complaint rates stay within defined limits.

## Priority stack

Only the first three items may be treated as immediate priorities.

| Priority | Work | Status | Evidence required |
|---|---|---|---|
| 1 | Monitor Apple review and release health | WAITING | Apple status, release date, first 72-hour health read |
| 2 | Establish the event dictionary and measurement pipeline | NEXT | Verified event records from a TestFlight/production journey |
| 3 | Create the first weekly baseline scorecard | NEXT | App Store, Sentry, API, product, and AI cost numbers with date ranges |
| 4 | Complete the next layers of coaching-quality testing | IN PROGRESS | Controlled baseline: 20/20 plans and 4/4 adaptations passed; expert/device/persistence layers remain |
| 5 | Observe ten new-user journeys | NEXT | Friction log with severity and journey stage |
| 6 | Run founder-led message tests | PARKED | Attributed content results |
| 7 | Define free versus paid packaging | PARKED | Activation, retention, cost, and willingness-to-pay evidence |

## Guardrails

- Do not increase paid acquisition before activation attribution works.
- Do not add another AI provider merely to mask an unclear reliability problem.
- Keep YouTube retrieval on the YouTube API; use OpenAI for reasoning and structured coaching where it adds value.
- Prefer rules, validation, caching, and saved context before another model call.
- Never report an unavailable metric as zero.
- Separate observations, interpretations, and decisions.
- Every new feature must improve activation, retention, reliability, safety, or unit economics.

## Weekly executive review

Every Friday, answer:

1. What moved the north-star metric?
2. Where did users drop out?
3. What broke or cost more than expected?
4. What did users say in their own words?
5. What will we repeat, stop, and test next?
6. Which roadmap status changed, and what evidence justified it?

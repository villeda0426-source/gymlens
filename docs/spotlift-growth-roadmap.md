# SpotLift Product and Growth Roadmap

Baseline date: August 15, 2026

## North-star outcome

A new user completes one personalized workout and receives a saved next-workout recommendation within 72 hours.

SpotLift should become the clearest beginner gym companion: scan or search what is in front of you, learn how to do it safely, complete a useful workout, and return to a plan that remembers your progress.

## Current baseline

### Confirmed strengths

- The iOS app is publicly available under Apple app ID `6768139635`.
- The production API, dependency health, equipment search, videos, workout guide, and legacy workout-guide route are reachable.
- Mobile and server TypeScript checks pass.
- EAS produced successful iOS store builds for version 1.0.7, builds 40, 41, and 42.
- The product contains a differentiated beginner loop: equipment scanning, exercise education, Coach, weekly plans, and progress visualization.
- Sentry and Vexo integrations exist in the client.

### Critical gaps

- The public App Store listing is still version 1.0.5. Version 1.0.7 build 42 was rejected under Guideline 5.1.1(v) because the app does not provide in-app account deletion.
- The prior review of build 41 also found a login error on an iPad Air 11-inch (M3). Build 42 moved past that issue, but the login flow still needs regression coverage.
- The local release configuration is version 1.0.6 build 38, behind the latest successful EAS artifact (1.0.7 build 42).
- The production Coach/Trainer endpoint currently returns HTTP 500 with `COACH_UNAVAILABLE`.
- The release smoke test therefore fails at the Trainer check.
- Production version policy reports minimum and latest iOS build as `0`, so update guidance and enforcement are inactive.
- App Store Connect's 90-day overview through August 14 reports 322 impressions, 100 product-page views, 23 first-time downloads, 6 redownloads, 16 updates, and a 14.3% daily-average conversion rate.
- App Store Connect reports insufficient data for average retention and crashes by app version, and source-level product-page data is below the reporting threshold.
- Analytics initialization exists, but a complete business-event funnel is not visible in the codebase.
- The App Store does not yet have enough ratings to show a ratings overview.

## Priority order

1. Restore Coach reliability.
2. Reconcile release versions and get 1.0.7 through App Store Connect.
3. Instrument the activation funnel end to end.
4. Establish the real baseline from App Store Connect, Vexo, Sentry, and the database.
5. Improve first-workout activation before spending meaningfully on acquisition.
6. Run founder-led creative tests, then promote only proven concepts.

## Phase 0: Stabilize and ship (next 72 hours)

### Product

- Diagnose the production Coach provider failure using request IDs and Railway logs.
- Keep scan, search, saved equipment, and workout education usable when Coach is unavailable.
- Make the full release check pass: client typecheck, server typecheck, and all production smoke tests.
- Manually test the latest TestFlight build across login, scan, search, Coach, plan generation, saved equipment, and logout.

### Release

- Set the repository version/build to the actual next release source of truth.
- Add complete account deletion inside the app, including deletion of associated user data, with a confirmation step.
- Record the complete deletion flow on a physical device and attach it in App Review Information notes as Apple requested.
- Regression-test login on a clean install and as an update, including iPad compatibility behavior even though the app is iPhone-oriented.
- Resubmit version 1.0.7 build 42 after the deletion flow and review evidence are ready.
- After release, set `LATEST_IOS_BUILD_NUMBER` to the shipped build. Set `MIN_IOS_BUILD_NUMBER` only when older builds are genuinely incompatible.

### Exit criteria

- Production smoke test passes completely.
- One tested iPhone can complete the north-star activation flow.
- The intended release is visible publicly in the App Store.
- Sentry shows no release-blocking crash in the tested flow.

## Phase 1: Measurement and activation (days 4–14)

### Event funnel

Instrument and verify:

1. `store_view -> install`
2. `onboarding_start -> onboarding_complete`
3. `plan_requested -> plan_created -> plan_accepted`
4. `workout_started -> workout_completed`
5. `next_workout_recommendation_saved`
6. `paywall_view -> trial_start -> purchase` when subscriptions are enabled
7. D1, D7, D14, and D30 activity
8. cancellation, refund, Coach failure, scan failure, and recommendation dismissal

Every acquisition event should retain source, campaign, creative, promise, platform, app version, and build number.

### Product experiments

- Reduce time from opening the app to a useful first action.
- Put one primary promise on the home/store experience: "Walk into the gym knowing exactly what to do."
- Show the user why the plan changed after a completed workout.
- Add a visible next action after every scan, search, and completed exercise.
- Watch ten first-time-user sessions and interview five active users plus five users who stopped.

### Initial targets

These are directional until the first clean two-week baseline exists:

- Crash-free sessions: at least 99.5%.
- Critical API availability: at least 99.5%.
- Median time to first useful result: under 2 minutes.
- At least 40% of onboarding starters complete onboarding.
- At least 25% of new users complete a first workout within 72 hours.
- At least 50% of first-workout completers save or view their next recommendation.

## Phase 2: Founder-led demand learning (days 15–30)

- Produce ten distinct concepts with three opening hooks each.
- Focus on beginner pain: machine confusion, fear of looking lost, random-program hopping, trainer cost, and not knowing what to do today.
- Show a real product action in every asset within the first six seconds.
- Use one attributed App Store link per creative or campaign.
- Publish consistently and score attention, qualified engagement, profile/link action, activated downloads, and repeatability.
- Do not choose winners from likes alone; prioritize saves, shares, beginner-intent comments, attributed installs, and activations.

One concept to repeat: real gym confusion followed immediately by a scan or personalized next action.

One thing to reduce: feature-list creative that leads with "AI" but does not demonstrate an outcome.

One test: "I pay for a gym but still don't know what to do" versus "Scan any machine before you guess."

## Phase 3: Creator and paid validation (days 31–60)

- Recruit creators only after founder content identifies repeatable hooks.
- Screen for hook instinct, believability, demonstration quality, beginner audience fit, iteration speed, and compliant claims.
- Test organic winners at $25–$50 per day per creative.
- Judge campaigns on activated-user CAC and downstream retention, not installs or clicks alone.
- Stop creatives when marginal CAC, refund behavior, safety complaints, or cohort retention breaks the threshold.

## Phase 4: Controlled subscription growth (days 61–90)

- Make adaptation, continuity, accountability, and progress interpretation the paid value.
- Test paywall timing after a plan preview, after the first workout, and after the first adaptation insight.
- Test monthly versus annual-with-trial before adding more pricing complexity.
- Scale budgets by 20–50% only when contribution LTV:CAC is expected to be at least 3:1 and payback is within the chosen window.
- Build cancellation-reason capture and a respectful pause/downgrade path.

## Weekly operating cadence

- Monday: activation, conversion, retention, crashes, and support issues.
- Tuesday: ship one activation or reliability improvement.
- Wednesday: hooks, content results, and creator pipeline.
- Thursday: attribution, campaign economics, and release health.
- Friday: user interviews, cancellations, failed recommendations, and next experiment.
- Weekend: batch founder content and prepare the next week's tests.

## Baseline dashboard needed

Fill these from App Store Connect and product analytics before setting aggressive growth targets:

- App Store impressions
- product page views
- first-time downloads
- redownloads
- product-page conversion rate
- active devices and sessions
- crashes and deletions
- onboarding completion
- first plan accepted
- first workout completed within 72 hours
- next recommendation viewed/saved
- D1, D7, and D30 retention
- subscription starts, trial-to-paid, refunds, and cancellations
- results segmented by source, campaign, creative, promise, app version, and build

## Immediate next 10 actions

1. Implement complete in-app account deletion and associated data cleanup.
2. Record the physical-device deletion flow and add it to App Review Information.
3. Diagnose and restore the production Coach endpoint.
4. Reconcile `app.json`, `package.json`, EAS artifacts, and the App Store version.
5. Regression-test login on a clean install and update path, then resubmit build 42.
6. Define and implement the north-star activation event.
7. Build one funnel dashboard with version and acquisition attribution.
8. Review ten new-user journeys and interview ten users or churned prospects.
9. Rewrite the first store screenshot and home promise around one beginner outcome.
10. Produce and measure the first ten founder-led creative concepts before increasing ad spend.

## Coach Reliability Review

Review date: August 15, 2026

### Executive assessment

Coach became unavailable in production because the previous AI provider account used by Railway had insufficient API credit. This was a confirmed provider response from production logs, not a speculative diagnosis. The API returned the user-facing `COACH_UNAVAILABLE` response in roughly 220 milliseconds because the provider rejected the request immediately.

Migration status: SpotLift's AI runtime has now been consolidated on the OpenAI Responses API. Coach, workout search, equipment-image identification, load estimation, and catalog generation use the same OpenAI service with feature-specific model settings and response schemas. The previous providers are no longer runtime dependencies.

Current reliability status: **Critical / unavailable**.

### Confirmed evidence

- `POST /api/coach-trainer` returns HTTP 500 in production.
- Production Railway logs showed a provider HTTP 400 billing error: the credit balance was too low to access the API.
- The failure reproduced twice with separate provider request IDs and separate SpotLift/Railway request IDs.
- The request fails in about 216-227 ms, eliminating the configured 30-85 second timeout as the present cause.
- `/health` and `/api/dependency-health` remain green because they verify process health, configuration presence, and Supabase reachability—not a real Coach inference or provider account capacity.
- Equipment search, videos, and both workout-guide routes remain healthy. The incident is isolated to AI Coach generation rather than the whole API.
- Mobile and server TypeScript checks pass. This is primarily a runtime dependency and recovery-policy failure, not a compile failure.

### Current request architecture

The current Coach path is:

1. The signed-in mobile client submits a Coach request with platform, app version, build number, and bearer token headers.
2. New-plan intake starts an asynchronous database job and polls every 2.5 seconds for up to 180 seconds.
3. Chat, goal updates, and workout adaptations use a synchronous request with a 120-second client timeout.
4. The server calls the configured OpenAI Coach model, defaulting to `gpt-5-mini`.
5. On selected recoverable failures, the server retries formatting or calls the OpenAI fallback model, defaulting to `gpt-5-nano`.
6. If model output remains malformed or times out, the service can return a local fallback response.
7. The client preserves the failed prompt, displays a generic connection message, and provides a resend action.

This design contains useful resilience mechanisms, but the incident reveals that their trigger conditions and failure-domain boundaries are too narrow.

### What is working well

- The app does not automatically retry non-idempotent AI POST requests, reducing accidental duplicate generations and cost.
- Intake plan generation uses a job abstraction, avoiding a single long mobile HTTP connection.
- The client preserves the failed prompt so a user can retry without retyping it.
- Output is validated against a defined plan schema, with JSON repair and a constrained formatting retry.
- Newer app builds receive longer server-side generation timeouts.
- Request IDs are present in production logs and responses, enabling incident correlation.
- Core non-Coach functionality remains available during this incident.

### Reliability defects and risks

#### P0 — Both model paths share one billing failure domain

The primary and fallback models are different, but both use the same OpenAI API key, account balance, network, and vendor control plane. A billing, credential, account, or provider-wide incident can disable both at once.

Current decision: keep all AI traffic on OpenAI as requested. Reliability therefore depends on OpenAI billing alerts, circuit breaking, safe degraded responses, caching, and reviewed non-generative fallbacks rather than a second AI vendor.

#### P0 — Provider account errors bypass recovery

The recovery classifier recognizes syntax errors, schema/JSON failures, array-format failures, and timeouts. It does not classify insufficient credit, rate limits, authentication errors, overloaded providers, connection failures, or most 5xx responses as recoverable. Those errors are thrown immediately and become a 500.

Required change: normalize provider errors into explicit categories such as `billing_unavailable`, `rate_limited`, `authentication_failed`, `provider_overloaded`, `provider_timeout`, `invalid_output`, and `unknown_provider_error`. Route recoverable categories to the independent provider and/or a safe degraded response.

#### P0 — Health checks do not measure Coach readiness

Dependency health only checks whether AI keys exist. An expired, invalid, suspended, quota-exhausted, or credit-exhausted key still appears healthy.

Required change: expose a sanitized `/api/coach-health` readiness result backed by recent real inference outcomes and circuit state. Do not make a paid model call on every health request; cache a lightweight canary result and combine it with rolling production success/error data.

#### P0 — The existing intake fallback is not user-safe enough

The local intake fallback is a hard-coded strength/swimming program. It only infers units and a rough day count from the prompt. It can return assumptions the user never supplied, including full-gym access, pool access, no injuries, and a strength/swimming goal. That is not a valid general fallback for arbitrary users and could undermine trust or safety.

Required change: never silently substitute this fixed plan. During total provider failure, return a transparent gathering/degraded response, preserve the user's inputs, and offer a reviewed beginner template only after the user explicitly selects matching goal, equipment, schedule, experience, and limitations.

#### P1 — Async jobs are not durable workers

The API inserts a job and starts processing with an unawaited in-process promise. If the Railway instance restarts, deploys, crashes, or scales between insertion and completion, a job may remain queued or running indefinitely. There is no visible lease, heartbeat, retry count, expiration, or recovery worker.

Required change: process jobs through a durable worker/queue or implement database leasing with `attempt_count`, `lease_expires_at`, heartbeat, idempotency key, retry policy, and stale-job recovery.

#### P1 — Job access and ownership need tightening

The server uses a service-role Supabase client. Job creation can proceed with a null user when authentication resolution fails, and job status lookup selects by job UUID without also enforcing the authenticated owner. UUIDs are difficult to guess but are not an authorization control.

Required change: require a valid user for creation and polling; query by both `id` and authenticated `user_id`; reject unauthorized access consistently; add appropriate database policies as defense in depth.

#### P1 — Client errors are too generic for recovery and measurement

The client converts nearly every operational failure into the same connection message. It does not distinguish expired authentication, provider outage, rate limit, timeout, invalid plan response, or a queued job that became stale. No explicit Coach success/failure analytics event is visible in the client path.

Required change: return stable public error codes with `retryable` and optional `retryAfterSeconds`; translate them into specific user actions; record privacy-safe events for request type, latency bucket, provider, fallback use, outcome, app version, and build.

#### P1 — Repository and production sources have drifted

The active Railway deployment was built from Git commit `b9ca4366f8ab61aa8b019a2bcb67e28ddc09b991`, while the local checkout reports `a70897ed632acdd2823e770352712371fa4a8ced` and the current Coach files are untracked in the local worktree. The observed production response is sanitized as `COACH_UNAVAILABLE`, while the local route shown in this workspace would return `error.message` directly. This makes diagnosis, fixes, and release verification less reliable.

Required change: reconcile the working tree with the deployed main branch before implementing the restoration. Establish one reviewed source of truth and ensure deployment metadata exposes the exact application commit.

#### P2 — Timeout implementation does not cancel provider work

The OpenAI service now uses abort signals and clears timeout timers in `finally`, preventing timed-out work from continuing indefinitely in the application process.

Required change: use provider-supported abort signals, clear timers in `finally`, and apply a total request budget across primary and fallback attempts.

#### P2 — Capacity and cost controls are incomplete

The API has a general in-memory IP rate limit, but there is no visible per-user Coach quota, concurrency cap, token budget by mode, cost budget, or billing alert. In-memory rate buckets also reset on restart and are not shared across replicas.

Required change: add per-user and global concurrency limits, mode-specific token ceilings, a shared rate-limit store when scaling, daily cost alerts, and hard/soft budget thresholds that trigger degraded mode before credit reaches zero.

### Restoration plan

#### Stage 1 — Restore service safely (same day)

1. Maintain valid billing capacity for the OpenAI project associated with Railway's API key.
2. Confirm the Railway secret references the intended active OpenAI project without revealing or rotating the value unnecessarily.
3. Run one minimal provider canary, followed by the production Coach smoke test.
4. Test all four modes: `chat`, `intake`, `adapt`, and `update_goals`.
5. Confirm that failure responses remain sanitized and that provider/billing details are never exposed to the mobile client.
6. Confirm no stale `coach_trainer_jobs` remain indefinitely queued or running; mark or retry them through a controlled recovery process.

Stage 1 exit criteria:

- Five consecutive minimal Coach requests succeed.
- All four modes return schema-valid responses.
- Production release smoke test passes.
- P95 chat latency is measured and below the current client timeout.
- No raw provider error or API credential information reaches the client.

#### Stage 2 — Remove the single-provider outage path (next 2-3 days)

1. Introduce a provider adapter with one internal request/response contract.
2. Keep OpenAI as the only AI platform and implement safe non-generative degraded behavior for platform-wide incidents.
3. Normalize provider errors and define exactly which categories fail over.
4. Add a circuit breaker: open after a small rolling threshold of provider-account or provider-availability failures, probe cautiously, and close after verified recovery.
5. Replace the fixed swimming/strength fallback with a transparent degraded-mode response and reviewed templates.
6. Add unit tests for billing failure, 429, 401/403, timeout, malformed JSON, schema mismatch, provider 5xx, and successful fallback.

Stage 2 exit criteria:

- A simulated OpenAI billing or availability failure returns a transparent degraded response without losing the user's prompt.
- The circuit breaker prevents repeated calls to a known-failing provider.
- Degraded responses never invent user goals, injuries, equipment, or availability.

#### Stage 3 — Make jobs durable and observable (next 4-7 days)

1. Move plan jobs to a durable worker or database-leased worker loop.
2. Add job attempts, lease expiration, heartbeat, error code, provider, fallback-used flag, latency, and completion timestamps.
3. Enforce authenticated ownership on job creation and status access.
4. Add stale-job recovery and a terminal timeout state.
5. Add a Coach reliability dashboard and alerts.

Recommended dashboard metrics:

- request count by mode
- success rate and schema-valid rate
- latency P50/P95/P99 by mode and provider
- primary-provider success rate
- fallback invocation and fallback success rate
- timeout, rate-limit, billing, authentication, invalid-output, and 5xx counts
- queued/running/stale job counts and age of oldest job
- token usage and estimated cost per completed response
- user retry rate after failure
- app version/build distribution for failures

Stage 3 exit criteria:

- No job can remain queued/running beyond its lease without being recovered or failed.
- Every request is traceable by a SpotLift request ID without logging health details or prompt content unnecessarily.
- Alerts fire before user-visible availability falls below the target.

### Proposed service objectives

Set these after one week of clean baseline data, but use them as initial engineering targets:

- Coach successful-response availability: at least 99.5% monthly.
- Schema-valid response rate among successful provider calls: at least 99.9%.
- P95 chat response latency: under 15 seconds.
- P95 initial plan completion: under 90 seconds.
- Stale asynchronous jobs: zero.
- Provider billing/quota alert lead time: at least 24 hours or 20% remaining budget, whichever occurs first.
- Raw provider-error exposure to clients: zero.

### Verification matrix

| Scenario | Expected behavior |
| --- | --- |
| Primary provider succeeds | Return validated Coach response; no fallback call |
| Primary times out | Abort primary; try independent secondary inside total budget |
| Primary returns malformed JSON | One bounded repair/retry, then secondary provider |
| Primary returns 429/overloaded | Respect retry guidance; open circuit when threshold is met; use secondary |
| Primary has insufficient credit | Open billing circuit immediately; use secondary; alert owner |
| Primary authentication fails | Do not repeatedly retry; use secondary if approved; page owner |
| Both providers fail | Return transparent retryable degraded response; preserve prompt |
| App loses network | Preserve draft; show offline-specific action; do not create duplicate job |
| API process restarts during plan | Durable worker recovers leased job or marks it terminal |
| User polls another user's job ID | Return 404/403 without revealing job existence or content |
| Provider returns unsafe or invalid plan | Reject schema/content; do not save plan; retry bounded path |

### Recommended implementation order

1. Maintain OpenAI billing capacity and verify production.
2. Reconcile local, GitHub main, Railway deployment, and App Store build sources.
3. Add provider error normalization and sanitized public error codes.
4. Add circuit breaking, caching, and reviewed non-generative fallbacks.
5. Replace the hard-coded intake fallback.
6. Secure and durabilize asynchronous jobs.
7. Add Coach-specific telemetry, budget alerts, and readiness reporting.
8. Add failure-injection tests to the release gate.

### Decision needed from the owner

The AI dependency is now the OpenAI project. The key is configured locally and in Railway, and local OpenAI-backed Coach and workout-guide requests pass. Production code deployment and removal of retired provider secrets remain separate release steps. No user data was mutated during this migration.

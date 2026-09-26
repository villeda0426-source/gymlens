# SpotLift Decision and Learning Log

Use this file for consequential decisions. A decision can be revised, but the original reasoning should remain visible.

## Decision template

### YYYY-MM-DD — Decision title

- Status: proposed / accepted / reversed
- Decision:
- Evidence:
- Assumptions:
- Alternatives considered:
- Expected effect:
- Measurement date:
- Result:
- Follow-up:

## Active decisions

### 2026-08-17 — Use one primary AI reasoning platform

- Status: accepted
- Decision: use OpenAI for AI reasoning, image understanding, structured workout-plan generation, and Coach interactions. Keep tutorial-video retrieval on the YouTube API.
- Evidence: consolidating the model layer simplifies reliability, observability, and billing. YouTube remains the authoritative integration for YouTube search and video metadata.
- Assumptions: OpenAI quality remains sufficient for the validated coaching schema; YouTube API availability and quota remain acceptable.
- Alternatives considered: Claude, Gemini, or a multi-provider runtime.
- Expected effect: fewer provider-specific failure paths and clearer AI unit economics.
- Measurement date: weekly during the validation sprint.
- Result: pending baseline.
- Follow-up: measure cost and success rate separately by feature; do not add provider failover without evidence.

### 2026-08-17 — Optimize for complete activation before paid growth

- Status: accepted
- Decision: prioritize the full first-workout-to-next-recommendation journey before materially increasing paid acquisition.
- Evidence: historical App Store volume is too small for reliable retention conclusions, and the product-event funnel has not yet been verified end to end.
- Assumptions: activation improvements will increase the value of every future install.
- Alternatives considered: increase advertising immediately or add subscriptions immediately.
- Expected effect: lower wasted acquisition spend and clearer product-market evidence.
- Measurement date: after two clean baseline weeks.
- Result: pending.
- Follow-up: revisit only when attribution and activation are measurable.

### 2026-08-17 — Define the north star around user value, not AI output

- Status: accepted
- Decision: count success when a new user completes a personalized workout and sees or saves the next recommendation within 72 hours.
- Evidence: a generated plan alone does not prove that the app helped someone train or return.
- Assumptions: the next recommendation is a meaningful indicator of coaching continuity.
- Alternatives considered: downloads, account registrations, scans, chats, or plans generated.
- Expected effect: product work remains focused on useful behavior and retention.
- Measurement date: first two weeks with verified events.
- Result: pending.
- Follow-up: refine the threshold after a clean baseline without changing historical definitions silently.

## Learning log

### 2026-08-17 — Current data gap

- Observation: Sentry and Vexo initialize in the client, and the server records privacy-limited AI usage, but a complete business-event funnel is not yet evident in the application code.
- Interpretation: downloads and crashes can be observed separately, but the team cannot yet explain where a user drops between plan creation and the next recommendation.
- Action: make event definition and verification the first post-release implementation priority.

### 2026-08-17 — App Store release state

- Observation: iOS 1.0.7 build 43 was built, uploaded, and submitted after addressing in-app account deletion.
- Interpretation: release work is waiting on Apple; active product time should move to measurement preparation without changing the submitted binary.
- Action: monitor review while preparing the validation sprint.

### 2026-08-18 — Founder real-device workout update

- Observation: the founder used the app during a real workout and reported that updating and changing workouts worked well, with no issues observed during the session.
- Interpretation: this is positive field evidence for the normal workout-update path and supports the controlled coaching results. It does not yet establish a failure rate, cross-device reliability, Spanish parity, or full-plan completion behavior.
- Journey stage covered: active workout updates and workout changes.
- Result: pass for one founder session.
- Action: keep the workflow unchanged for now; continue collecting device/build/language and repeat-session evidence. Prioritize any future regression only if it is reproducible or repeated.

### 2026-09-22 — Coach account history is a one-way safety gate

- Status: accepted
- Decision: load minimal authenticated account metadata before each Coach rules decision. Missing, stale, uncertain-age, under-18, over-59, active-limitation, recent-soreness, and profile-conflict states force AI; history never changes an AI decision into a rules reply.
- Evidence: the client had a local plan preview and global persisted Coach state, while the server router had no account context. Both could bypass stored limitations.
- Assumptions: the migration is applied before deploying the history-aware server path, and health-data consent/legal copy receives product review.
- Alternatives considered: infer safety from ordinary profile edits, persist raw messages for context, or let client rules proceed while history loads.
- Expected effect: fewer unsafe deterministic recommendations and no cross-account Coach-state leakage.
- Measurement date: before release, with a local Supabase RLS run and device regression.
- Result: static migration and offline routing checks passed; dynamic RLS proof pending local Supabase credentials.
- Follow-up: resolve source/deployed schema drift and age/under-13, retention, JWT, and third-party-AI disclosure decisions before migration application.

### 2026-09-26 — Applied pending migrations; reconciled migration-history drift

- Status: accepted
- Decision: applied `20260921000000_add_workout_guides_cache.sql` and `20260922010000_coach_accounts_history.sql` directly to production (verified via live introspection first: no naming conflicts, all target tables/columns absent beforehand). Confirmed with the user before running the one destructive step in the second migration (`update coach_trainer_jobs set payload = null, result = null`, affecting all 39 existing rows, 27 with prior result data) — approved as correctly enforcing the app's stated metadata-only retention policy.
- Evidence: `supabase migration list` showed 9 remote-only versions (timestamps with no matching local file) and, before this session, 7 local-only versions never marked applied. Live introspection confirmed the 9 remote-only versions' effects (ai_usage_events, workout_feedback tables; coach_trainer_jobs.idempotency_key/timings; app_installations) are genuinely live, and 5 of the 7 local-only files' effects were also already live (applied via the same untracked path) before this session — `20260826011000`'s specific handle_new_user() definition was confirmed superseded by later work, not literally re-applied, since redefining it now would have regressed the richer, currently-live trigger.
- Action: reconciled via `supabase migration repair --status applied` for all 16 versions, not `--status reverted` as the CLI's own error message suggested — that would have mislabeled live, functioning schema as rolled back. The CLI requires a local file per version to repair against; created 9 placeholder files for the untracked remote versions, explicitly documented as bookkeeping-only with no reconstructed SQL, since the original statements are not recoverable from this repo.
- Result: `supabase migration list` now shows every version on both sides; `supabase db push --dry-run` reports the remote database up to date. Verified live against production after applying: `/health` and `/api/dependency-health` healthy, and the new `workout_guides` cache confirmed working end-to-end (first call 6.0s via OpenAI, repeat call 0.48s from cache).
- Follow-up: the 9 placeholder files record that drift occurred and when, but not what the untracked migrations actually contained. If that content matters later (audit, rollback, onboarding a new environment), it will need to be reconstructed from the live schema directly, not from this repo's history.

# Coach account and history build — 2026-09-22

Status: implementation complete in the working tree; migration and local RLS proof are not applied/run against a database.

## Delivered by phase

1. Account and privacy foundation
   - Added an unapplied reconciliation migration for an additive, legacy-compatible `profiles` expansion, secure idempotent signup trigger/backfill, explicit age bands and separate safety-review freshness.
   - Added versioned `user_consents` and separate `user_limitations`; routing reads only limitation type/active state, never details.
   - Added authenticated `/api/account/export` and cascade-based `/api/account` deletion. Coach state now clears across account boundaries.

2. Prescribed versus actual history
   - Added `exercises`, `programs`, `plan_sessions`, `plan_exercises`, `workout_sessions`, `set_logs`, `coach_events`, and rebuildable `user_insights`, ownership FKs, indexes, and RLS policies.
   - Coach persists a prescription and structured event metadata only. Numeric set logging schema is ready; the current Plan UI does not yet capture sets/reps/RPE.

3. History-aware Coach router
   - Every authenticated Coach request loads profile, active limitation types, and recent structured events before rules routing.
   - Missing/unreadable/stale safety context, unconfirmed age, under-18, over-59, active limitation, recent soreness, or profile/message conflict forces AI. History cannot turn AI into a rules reply.
   - The local provisional starter-plan and client-side fallback were removed. A history-forced AI request disables static plan fallback.

4. Expanded rules and feedback
   - Rules now ask exactly one intake clarification when only one requirement is missing.
   - Swaps require a stated non-pain equipment/space reason and preserve pattern/equipment constraints. Local Plan swaps now direct users to Coach rather than bypassing account safety context.
   - Nutrition answers are general education, carry a non-personal disclaimer, and escalate diet/food-prescription/weight-loss requests.
   - Rules responses expose a one-time metadata-only feedback action. It writes only a route code and opaque response id; it does not alter routing in real time.

## Verification

- Passed: `npm run typecheck`
- Passed: `npm run typecheck:server`
- Passed: `npm run check:coach:router`, including all 16 English/Spanish safety-baseline prompts, history gates, kill switch, new swap/nutrition rules, and unique plan exercise IDs.
- Passed: static `npm run check:rls` checks.
- Not run: dynamic RLS isolation / trigger / cascade proof. It requires explicitly local Supabase credentials and rejects hosted URLs by design.
- Not run: migration application, remote Coach safety baseline, or release E2E.

## Conflicts and review flags

- Repository schema drift remains: source code references `ai_usage_events` and `workout_feedback`, but tracked SQL does not define them. This build intentionally does not recreate unknown deployed tables.
- The pending `20260921000000_add_workout_guides_cache.sql` migration remains separate and unapplied.
- Legal/product review is still required for health-data retention, consent language/versioning, deletion/export disclosure, under-13/COPPA handling, short JWT expiry/session validation, and the exact third-party AI disclosure. Current Coach code uses OpenAI; do not label it as another provider in privacy copy.
- Apple/Google deletion policy details must be verified in their current console requirements before release; no store submission or deployment was performed here.

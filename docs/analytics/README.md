# SpotLift product analytics

First-party analytics stored in our own Supabase database. No third-party
analytics SDK, no Vexo, and nothing that changes navigation. Decision and
comparison with PostHog: see the 2026-10-26 conversation. In short, half the
funnel and all AI cost already live in Postgres, the app needs no new native
modules, and no new data processor is added.

## Architecture

```
App (build 50+)                          API server (Railway)                Supabase Postgres
lib/analytics  ── POST /api/analytics/events ──▶ validate, allowlist,  ──▶ analytics_events
  outbox queue    POST /api/analytics/installation  dedupe, rate-limit     app_installations
  (AsyncStorage)                                                            installation_identities
lib/api.ts headers ─────────▶ request context ─▶ ai_usage_events (user, feature, cost)
                                (request id,
                                 verified user)    triggers on profiles / workout_sessions
                                                   ──▶ analytics_events (source = database)
```

- **Installation id**: random UUID (expo-crypto) in AsyncStorage, created
  before the first event. Deleting the app or clearing its data creates a new
  installation (and a new `app_first_open`). No Keychain, IDFA/IDFV, hardware
  ids or fingerprinting.
- **Session id**: new at cold start and after 30 minutes in the background.
- **Identity segment**: random id that rotates at every logout (and on a
  direct account switch). The first account that signs in during a segment
  owns it (`installation_identities`), which links that installation's
  pre-signup events to the account. Later accounts on the same phone start a
  new segment, so their activity is never merged with the previous user's.
- **User id on events**: stored only when it equals the user verified from the
  bearer token of the delivering request. Otherwise null, resolved later via
  the segment (`analytics.events_resolved`). Client headers and body fields
  are never used for identity or authorization.

## Event catalog

| Event | Recorded by | Code location | Fires when | Properties |
|---|---|---|---|---|
| `app_first_open` | app | `lib/analytics/index.ts` `initAnalytics` | installation id was just created (first launch of a new installation) | — |
| `signup_started` | app | `app/(auth)/login.tsx` (mode → signup; Apple button), `app/(auth)/register.tsx` (mount) | user opens the email signup form, or taps Sign in with Apple | `method`: email/apple |
| `signup_completed` | database | trigger `analytics_signup_completed` on `profiles` insert | the account's profile row is created (email: before the address is confirmed; Apple: first sign-in) | `method` from auth provider |
| `coach_survey_started` | app | `app/plan-setup/goal.tsx` (step 1 mount) | survey step 1 opens | `entry`: new/rebuild |
| `coach_survey_completed` | database | trigger `analytics_coach_survey_completed` on `profiles.safety_reviewed_at` | the survey answers are saved (`store/planSetupStore.ts` `submit`) | goal, days_per_week, session_minutes, equipment_type, experience_level |
| `plan_generated` | app | `store/coachTrainerStore.ts` `setPlan(plan, origin)`; origins at `store/planSetupStore.ts:197`, `app/(tabs)/trainer.tsx:334,709`, `app/(tabs)/plan.tsx:1268`, `app/import-routine.tsx:42` | a usable plan is saved as the active plan (survey option chosen, Coach plan ready/chosen, end-of-plan feedback plan, imported routine) | origin, days_per_week, timeline_weeks |
| `workout_started` | database | trigger `analytics_workout_started` on `workout_sessions` insert | a workout session row is created (guided session start, or first exercise ticked on the Plan tab) | kind plan/adhoc, plan_week, session_index |
| `workout_completed` | app | `store/coachTrainerStore.ts` `markExerciseCompleted` (plan); `app/workout-session.tsx` finish (ad-hoc, after the save succeeds) | a plan workout's last exercise is saved as done; an ad-hoc session's completion is saved | kind, plan_week, session_index |
| `screen_view` | app | `lib/analytics/ScreenTracker.tsx`, mounted once in `app/_layout.tsx` | the active route pattern changes (initial screen included; same screen twice in a row is ignored) | `screen` = route pattern such as `equipment/[id]` |

Rules:
- Success events fire only after the action succeeded. Database events fire in
  the same transaction as the write that makes them true.
- Duplicates: every event has a unique `event_id` (primary key; `ON CONFLICT DO
  NOTHING`). Fact-based events derive the id from the fact
  (`workout_completed`: plan thread + session + completion number, or the
  ad-hoc session id; database events: the row), so retries, re-renders and
  repeated taps collapse to one row.
- Properties are an allowlist in `shared/analyticsEvents.ts`, checked on the
  device and again on the server: short enums and small integers only. No
  names, emails, free text, prompts, plan content, route parameters or query
  strings.
- Clients can't send `signup_completed`, `coach_survey_completed` or
  `workout_started`. Those come only from the database.

## Delivery and failure handling

- Outbox in AsyncStorage: at most 500 events and 7 days old. Oldest are
  dropped first, and unreadable storage counts as empty.
- Sent in batches of up to 50, 3 seconds after the last event, when the app
  is backgrounded or foregrounded, and right before sign-out (waits at most
  2 seconds).
- 10-second request timeout. Backoff 5s, 10s, 20s up to 5 minutes, with
  jitter.
- Nothing awaits analytics. Every public function catches its own errors; in
  production they're silent, in development they're logged as `[analytics]`.
- Server limits: 64 KB per body, 50 events per batch, 300 requests per IP and
  1,000 events per installation per 15 minutes. Analytics is excluded from the
  app's general request limit.
- A 503 from storage keeps the events queued. A whole-batch 400 or 413 drops
  that batch so it can't retry forever.

## Off switches

| Where | How | Effect |
|---|---|---|
| Railway | `ANALYTICS_INGEST_ENABLED=false` | Server stores nothing and answers `analyticsEnabled:false`. Apps stop sending and empty their queues. Setting it back to true re-enables them on their next launch. AI usage logging is separate and keeps running. |
| EAS build env | `EXPO_PUBLIC_ANALYTICS_ENABLED=false` | That build never collects or sends anything. |
| Database | `alter table public.analytics_events disable trigger user;` and `alter table public.profiles disable trigger analytics_signup_completed, ...` | Stops database-recorded events; collected data is kept. |

## AI usage attribution

`server/services/openaiService.ts` logs every OpenAI call: success and failure,
each primary and fallback attempt, background Coach jobs, and script runs.
Each row records:
- **Who:** `user_id`, from a verified token only. `actor` is
  user/anonymous/system.
- **What:** `feature` (`equipment_observe`, `equipment_identify`,
  `equipment_weight_factor`, `workout_search`, `coach_intake`, `coach_adapt`,
  `coach_update_goals`, `coach_chat`, `coach_workout_review`, `lottie_seed`),
  `model`, `provider`.
- **Usage and cost:** tokens, including cached input, `cost_usd`, estimated
  from `server/lib/aiPricing.ts` and overridable with `AI_PRICING_JSON`, and
  `pricing_version`.
- **Outcome:** `latency_ms`, `succeeded`, and `error_class`, a coarse class
  never the error message.
- **Request:** `request_id`, app version, build, platform and installation.

Coach background jobs carry the original request's verified context through
`runWithContext`. There are no streaming calls. Prompt and response text is
never stored.

Before the migration is applied, the server falls back to the original
columns and still records `user_id`.

## Retention

- **Raw `analytics_events`:** 13 months, purged daily by
  `public.purge_expired_analytics()`, which the API server calls.
- **`installation_identities` and `app_installations`:** kept while the
  account exists.
- **On-device queue:** at most 7 days or 500 events.
- **Account deletion:** cascades to the account's events, identity links and
  installation rows. Anonymous pre-signup events that were never linked to an
  account remain, keyed only by the random installation id, until they expire.

## Reporting

`docs/analytics/queries.sql` holds the saved queries. Run them in the Supabase
SQL editor, or all of them read-only with `npm run analytics:report [name-filter]`.

| Query | What it answers |
|---|---|
| `funnel_by_weekly_cohort` | Weekly first-open cohorts and how many reached each step |
| `funnel_step_dropoff` | Step-to-step counts, drop-off and conversion, for closed cohorts |
| `top_screens_30d` | Most-viewed screens |
| `last_screen_before_inactivity` | Last screen of each session, split into confirmed 7-day inactivity, returned, or too recent |
| `installations_by_version`, `users_by_version_from_requests` | Installations and users per app version and build |
| `ai_cost_by_feature_30d`, `ai_cost_by_user_30d` | AI calls, failures and estimated cost |

Definitions:
- **Timezone:** America/Chicago, with weeks starting Monday.
- **Conversion window:** 14 days from first open. Steps must come in order,
  with 10 minutes of slack for device-vs-server clock skew.
- **Repeat events:** the first occurrence after the previous step counts;
  later repeats are ignored.
- **Inactivity:** 7 days with no event from the installation. A session ending
  on a screen is not an abandonment; only "no return within 7 days" is counted
  as confirmed inactivity.
- **Identity:** each funnel row follows the first account linked on the
  installation.
- **Apple and `signup_started`:** Apple's button also signs existing users in,
  so a reinstalling user tapping it shows as a signup start without a later
  `signup_completed`.

Coverage: client events start with build 50. Database events and AI
attribution cover every build from the day the migration is applied (and from
deploy for AI `user_id`).

## Migration

The migration is `supabase/migrations/20261026120000_product_analytics.sql`
and it is additive only.

**Verification after applying:**
```sql
select to_regclass('public.analytics_events'), to_regclass('public.installation_identities');
select tgname from pg_trigger where tgname like 'analytics_%';
select column_name from information_schema.columns where table_name = 'ai_usage_events' and column_name in ('actor','cost_usd','request_id');
select has_table_privilege('anon', 'public.analytics_events', 'select'), has_table_privilege('authenticated', 'public.analytics_events', 'insert'); -- both false
select event_name, source, count(*) from public.analytics_events group by 1, 2;
```

**Disable without losing data:** use the off switches above. Collected rows
stay.

**Full rollback:** run this only after exporting `analytics_events` and
`installation_identities` if the data should be kept:
```sql
drop trigger if exists analytics_signup_completed on public.profiles;
drop trigger if exists analytics_coach_survey_completed on public.profiles;
drop trigger if exists analytics_workout_started on public.workout_sessions;
drop schema if exists analytics cascade;   -- views only
-- tables/columns can stay (nothing reads them); dropping them deletes the data:
-- drop table public.analytics_events, public.installation_identities;
```
The new `ai_usage_events` and `app_installations` columns are nullable and
safe to leave in place.

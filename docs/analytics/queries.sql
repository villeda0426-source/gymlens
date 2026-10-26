-- SpotLift saved analytics queries (docs/analytics/README.md for definitions).
-- Run any block in the Supabase SQL editor, or all of them read-only with:
--   npm run analytics:report
-- Each block starts with "-- name:" (the report script splits on it).
--
-- Conventions
--   Timezone:          America/Chicago (weeks start Monday, local time)
--   Conversion window: 14 days from the installation's app_first_open
--   Inactivity:        7 days with no event from that installation
--   Identity:          an event's user is its verified user_id, else the
--                      account that owns its identity segment
--                      (analytics.events_resolved); an installation's funnel
--                      follows the FIRST account linked on it
--   Repeats:           a step counts once, at its first occurrence after the
--                      previous step (later repeats are ignored)

-- name: funnel_by_weekly_cohort
select cohort_week,
       count(*) as first_opens,
       count(signup_started_at) as signup_started,
       count(signup_completed_at) as signup_completed,
       count(survey_started_at) as survey_started,
       count(survey_completed_at) as survey_completed,
       count(plan_generated_at) as plan_generated,
       count(workout_started_at) as workout_started,
       count(workout_completed_at) as workout_completed,
       round(100.0 * count(workout_completed_at) / nullif(count(*), 0), 1) as pct_open_to_workout,
       -- cohorts whose 14-day window hasn't closed are still converting
       (cohort_week + 7 + 14 > (now() at time zone 'America/Chicago')::date) as window_still_open
from analytics.funnel_installations
group by cohort_week
order by cohort_week desc;

-- name: funnel_step_dropoff
-- Cohorts whose 14-day window has closed (first open 14+ days ago).
with closed as (
  select * from analytics.funnel_installations where first_open_at <= now() - interval '14 days'
),
funnel as (
  select * from (values
    (1, 'app_first_open', (select count(*) from closed)),
    (2, 'signup_started', (select count(signup_started_at) from closed)),
    (3, 'signup_completed', (select count(signup_completed_at) from closed)),
    (4, 'coach_survey_started', (select count(survey_started_at) from closed)),
    (5, 'coach_survey_completed', (select count(survey_completed_at) from closed)),
    (6, 'plan_generated', (select count(plan_generated_at) from closed)),
    (7, 'workout_started', (select count(workout_started_at) from closed)),
    (8, 'workout_completed', (select count(workout_completed_at) from closed))
  ) as f(step_order, step, installations)
),
ordered as (
  select step_order, step, installations, lag(installations) over (order by step_order) as previous,
         first_value(installations) over (order by step_order) as first_opens
  from funnel
)
select step, installations,
       previous - installations as dropped_from_previous,
       round(100.0 * installations / nullif(previous, 0), 1) as pct_of_previous,
       round(100.0 * installations / nullif(first_opens, 0), 1) as pct_of_first_open
from ordered
order by step_order;

-- name: top_screens_30d
select e.properties ->> 'screen' as screen,
       count(*) as views,
       count(distinct e.installation_id) as installations,
       count(distinct e.user_id) as users
from analytics.events_resolved e
where e.event_name = 'screen_view' and e.occurred_at >= now() - interval '30 days'
group by 1
order by views desc
limit 25;

-- name: last_screen_before_inactivity
-- The last screen of each app session, split by what happened next:
--   inactive_7d   no event from that installation for 7+ days afterwards
--                 (confirmed inactivity — the closest thing to abandonment)
--   returned      the installation came back within 7 days (a normal session end)
--   too_recent    under 7 days ago; not yet classifiable
with session_last as (
  select distinct on (e.session_id) e.session_id, e.installation_id, e.occurred_at,
         e.properties ->> 'screen' as screen
  from public.analytics_events e
  where e.event_name = 'screen_view' and e.session_id is not null
    and e.occurred_at >= now() - interval '60 days'
  order by e.session_id, e.occurred_at desc
),
classified as (
  select s.screen,
         case
           when exists (select 1 from public.analytics_events n
                        where n.installation_id = s.installation_id
                          and n.occurred_at > s.occurred_at
                          and n.occurred_at <= s.occurred_at + interval '7 days'
                          and n.session_id is distinct from s.session_id) then 'returned'
           when s.occurred_at > now() - interval '7 days' then 'too_recent'
           else 'inactive_7d'
         end as outcome
  from session_last s
)
select screen,
       count(*) filter (where outcome = 'inactive_7d') as inactive_7d,
       count(*) filter (where outcome = 'returned') as returned,
       count(*) filter (where outcome = 'too_recent') as too_recent,
       round(100.0 * count(*) filter (where outcome = 'inactive_7d')
             / nullif(count(*) filter (where outcome <> 'too_recent'), 0), 1) as pct_inactive
from classified
group by screen
order by inactive_7d desc, returned desc
limit 25;

-- name: installations_by_version
-- Current version per installation (last launch), and how many of them are
-- signed in. Older builds (≤49) never report installations, so this only
-- covers build 50+.
select platform, app_version, build_number,
       count(*) as installations,
       count(user_id) as with_account,
       count(*) filter (where last_seen_at >= now() - interval '30 days') as seen_last_30d,
       max(last_seen_at) as last_seen
from public.app_installations
group by platform, app_version, build_number
order by build_number desc nulls last, installations desc;

-- name: users_by_version_from_requests
-- Users per app build, from AI calls (covers older builds too: every build
-- already sends its version on each request).
select coalesce(platform, 'unknown') as platform, coalesce(app_version, 'unknown') as app_version,
       build_number, count(distinct user_id) as users, count(*) as ai_calls,
       max(created_at) as last_seen
from public.ai_usage_events
where created_at >= now() - interval '30 days'
group by 1, 2, 3
order by build_number desc nulls last;

-- name: ai_cost_by_feature_30d
select feature, model,
       count(*) as calls,
       count(*) filter (where not succeeded) as failed,
       count(distinct user_id) as users,
       sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
       round(sum(cost_usd), 4) as cost_usd,
       round(sum(cost_usd) / nullif(count(distinct user_id), 0), 4) as cost_per_user_usd,
       round(avg(latency_ms)) as avg_latency_ms,
       count(*) filter (where cost_usd is null) as calls_without_cost
from public.ai_usage_events
where created_at >= now() - interval '30 days'
group by feature, model
order by cost_usd desc nulls last, calls desc;

-- name: ai_cost_by_user_30d
-- Users are shown by id only; join to profiles yourself if you need more.
select coalesce(user_id::text, '(' || coalesce(actor, 'unattributed') || ')') as user_or_actor,
       count(*) as calls,
       count(distinct feature) as features,
       round(sum(cost_usd), 4) as cost_usd,
       string_agg(distinct feature, ', ') as feature_list
from public.ai_usage_events
where created_at >= now() - interval '30 days'
group by 1
order by cost_usd desc nulls last, calls desc
limit 50;

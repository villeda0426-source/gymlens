-- Product analytics (docs/analytics/README.md).
--
-- Additive only: two new tables, nullable columns on two existing tables,
-- three AFTER triggers that can never block the write that fires them, one
-- retention function, and reporting views in a new non-API schema. Safe to
-- run twice. Shipped app builds are unaffected: none of them read or write
-- anything created here.
--
-- Access: every new object is server-only. RLS is enabled with no policies
-- and anon/authenticated get no grants, so the app's public key can neither
-- read nor write analytics. Only the service role (the API server) and the
-- database owner (reporting) can.

-- ─── Events ────────────────────────────────────────────────────────────────

create table if not exists public.analytics_events (
  event_id uuid primary key,                          -- client- or fact-derived; dedupes retries
  event_name text not null check (event_name ~ '^[a-z][a-z_]{0,47}$'),
  schema_version smallint not null default 1,
  occurred_at timestamptz not null,                   -- client clock (or the row's own timestamp)
  received_at timestamptz not null default now(),     -- server clock
  installation_id uuid,                               -- random per install; null for database events
  segment_id uuid,                                    -- identity segment; rotates at logout
  session_id uuid,
  user_id uuid references public.profiles (id) on delete cascade,
  source text not null check (source in ('client', 'server', 'database')),
  platform text,
  app_version text,
  build_number integer,
  os_version text,
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 2048)
);

create index if not exists analytics_events_name_time_idx on public.analytics_events (event_name, occurred_at);
create index if not exists analytics_events_user_time_idx on public.analytics_events (user_id, occurred_at) where user_id is not null;
create index if not exists analytics_events_installation_time_idx on public.analytics_events (installation_id, occurred_at) where installation_id is not null;
create index if not exists analytics_events_segment_idx on public.analytics_events (segment_id) where segment_id is not null;

alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;

-- Which verified account each identity segment belongs to. The first account
-- to sign in during a segment owns it (pre-signup activity included); the
-- app starts a new segment at every logout.
create table if not exists public.installation_identities (
  segment_id uuid primary key,
  installation_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  linked_at timestamptz not null default now()
);

create index if not exists installation_identities_user_idx on public.installation_identities (user_id);
create index if not exists installation_identities_installation_idx on public.installation_identities (installation_id);

alter table public.installation_identities enable row level security;
revoke all on public.installation_identities from anon, authenticated;

-- ─── Existing tables: nullable columns only ────────────────────────────────

alter table public.app_installations
  add column if not exists os_version text;

alter table public.ai_usage_events
  add column if not exists actor text,                -- user | anonymous | system
  add column if not exists provider text,
  add column if not exists cached_input_tokens integer,
  add column if not exists cost_usd numeric(14, 8),   -- estimate; see pricing_version
  add column if not exists pricing_version text,
  add column if not exists error_class text,          -- coarse class only, never a message
  add column if not exists request_id uuid,
  add column if not exists app_version text,
  add column if not exists build_number integer,
  add column if not exists platform text,
  add column if not exists installation_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_events_actor_check') then
    alter table public.ai_usage_events add constraint ai_usage_events_actor_check
      check (actor is null or actor in ('user', 'anonymous', 'system'));
  end if;
end $$;

create index if not exists ai_usage_events_created_idx on public.ai_usage_events (created_at);

-- ─── Database-recorded funnel events ───────────────────────────────────────
-- Recorded where the fact becomes true, so they also cover older app builds
-- and can't be faked by a client. Event ids are derived from the row, so each
-- fact is stored at most once. Any failure is swallowed with a warning: an
-- analytics problem must never fail a signup, survey save or workout.

create or replace function public.analytics_record_db_event(
  p_key text, p_name text, p_user uuid, p_properties jsonb, p_occurred_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.analytics_events (event_id, event_name, occurred_at, user_id, source, properties)
  values (md5(p_name || ':' || p_key)::uuid, p_name, coalesce(p_occurred_at, now()), p_user, 'database',
          coalesce(jsonb_strip_nulls(p_properties), '{}'::jsonb))
  on conflict (event_id) do nothing;
exception when others then
  raise warning 'analytics event % not recorded: %', p_name, sqlerrm;
end;
$$;

create or replace function public.analytics_on_profile_insert() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text;
begin
  begin
    select case when u.raw_app_meta_data ->> 'provider' in ('email', 'apple') then u.raw_app_meta_data ->> 'provider' end
      into v_method
      from auth.users u where u.id = new.id;
  exception when others then
    v_method := null;
  end;
  perform public.analytics_record_db_event(
    new.id::text, 'signup_completed', new.id, jsonb_build_object('method', v_method), new.created_at);
  return new;
end;
$$;

create or replace function public.analytics_on_survey_saved() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.analytics_record_db_event(
    new.id::text || ':' || new.safety_reviewed_at::text,
    'coach_survey_completed',
    new.id,
    jsonb_build_object(
      'goal', case when new.goal in ('strength', 'hypertrophy', 'fat_loss', 'general_fitness') then new.goal end,
      'days_per_week', new.days_per_week,
      'session_minutes', new.session_minutes,
      'equipment_type', new.equipment_type,
      'experience_level', new.experience_level
    ),
    new.safety_reviewed_at);
  return new;
end;
$$;

create or replace function public.analytics_on_workout_started() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.analytics_record_db_event(
    new.id::text,
    'workout_started',
    new.user_id,
    jsonb_build_object('kind', new.source, 'plan_week', new.plan_week, 'session_index', new.session_index),
    new.started_at);
  return new;
end;
$$;

drop trigger if exists analytics_signup_completed on public.profiles;
create trigger analytics_signup_completed
  after insert on public.profiles
  for each row execute function public.analytics_on_profile_insert();

drop trigger if exists analytics_coach_survey_completed on public.profiles;
create trigger analytics_coach_survey_completed
  after update of safety_reviewed_at on public.profiles
  for each row
  when (new.safety_reviewed_at is not null and new.safety_reviewed_at is distinct from old.safety_reviewed_at)
  execute function public.analytics_on_survey_saved();

drop trigger if exists analytics_workout_started on public.workout_sessions;
create trigger analytics_workout_started
  after insert on public.workout_sessions
  for each row execute function public.analytics_on_workout_started();

revoke all on function public.analytics_record_db_event(text, text, uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.analytics_on_profile_insert() from public, anon, authenticated;
revoke all on function public.analytics_on_survey_saved() from public, anon, authenticated;
revoke all on function public.analytics_on_workout_started() from public, anon, authenticated;

-- ─── Retention ─────────────────────────────────────────────────────────────
-- Raw events are kept 13 months (a full year-over-year comparison). The API
-- server calls this daily. Identity links and installation rows are kept
-- while the account exists; account deletion cascades to all of them.

create or replace function public.purge_expired_analytics() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.analytics_events where occurred_at < now() - interval '13 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_analytics() from public, anon, authenticated;
grant execute on function public.purge_expired_analytics() to service_role;

-- ─── Reporting (not exposed through the Supabase API) ──────────────────────

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

-- Every event with the user it belongs to: its own verified user, else the
-- account that owns its identity segment. Times are also given in the
-- reporting timezone (America/Chicago).
create or replace view analytics.events_resolved as
select
  e.event_id,
  e.event_name,
  e.source,
  e.occurred_at,
  (e.occurred_at at time zone 'America/Chicago') as occurred_local,
  e.received_at,
  e.installation_id,
  e.segment_id,
  e.session_id,
  coalesce(e.user_id, ii.user_id) as user_id,
  e.platform,
  e.app_version,
  e.build_number,
  e.properties
from public.analytics_events e
left join public.installation_identities ii on ii.segment_id = e.segment_id;

-- One row per installation that has an app_first_open, with the first time
-- it reached each funnel step (null = not reached). Each step must come after
-- the previous one (10 minutes of slack absorbs device-vs-server clock skew)
-- and within 14 days of first open; client steps match the installation or
-- its first linked account, database steps match the account.
create or replace view analytics.funnel_installations as
with cohort as (
    select installation_id, min(occurred_at) as first_open_at
    from public.analytics_events
    where event_name = 'app_first_open'
    group by installation_id
  ),
  first_account as (
    select distinct on (installation_id) installation_id, user_id
    from public.installation_identities
    order by installation_id, linked_at
  ),
  base as (
    select c.installation_id, c.first_open_at, fa.user_id,
           date_trunc('week', c.first_open_at at time zone 'America/Chicago')::date as cohort_week
    from cohort c left join first_account fa using (installation_id)
  ),
  steps as (
    select b.*, s2.t as signup_started_at, s3.t as signup_completed_at, s4.t as survey_started_at,
           s5.t as survey_completed_at, s6.t as plan_generated_at, s7.t as workout_started_at, s8.t as workout_completed_at
    from base b
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where e.event_name = 'signup_started' and e.installation_id = b.installation_id
        and e.occurred_at >= b.first_open_at - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s2 on true
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where e.event_name = 'signup_completed' and e.user_id = b.user_id
        and e.occurred_at >= coalesce(s2.t, b.first_open_at) - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s3 on true
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where s3.t is not null and e.event_name = 'coach_survey_started'
        and (e.installation_id = b.installation_id or e.user_id = b.user_id)
        and e.occurred_at >= s3.t - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s4 on true
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where s4.t is not null and e.event_name = 'coach_survey_completed' and e.user_id = b.user_id
        and e.occurred_at >= s4.t - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s5 on true
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where s5.t is not null and e.event_name = 'plan_generated'
        and (e.installation_id = b.installation_id or e.user_id = b.user_id)
        and e.occurred_at >= s5.t - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s6 on true
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where s6.t is not null and e.event_name = 'workout_started' and e.user_id = b.user_id
        and e.occurred_at >= s6.t - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s7 on true
    left join lateral (select min(e.occurred_at) t from analytics.events_resolved e
      where s7.t is not null and e.event_name = 'workout_completed'
        and (e.installation_id = b.installation_id or e.user_id = b.user_id)
        and e.occurred_at >= s7.t - interval '10 minutes'
        and e.occurred_at <= b.first_open_at + interval '14 days') s8 on true
  )
  select * from steps;

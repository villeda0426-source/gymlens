-- Tap-only plan-setup flow + account age capture.
--
-- 1. profiles.session_minutes: the 5th structured field the new setup flow
--    writes (goal, days_per_week, equipment_type, experience_level already
--    existed from 20260922010000_coach_accounts_history.sql).
-- 2. profiles.birth_year + a small deterministic helper to compute age_band
--    from it, used by both the signup trigger (new accounts, collected on
--    the registration form) and the client's one-time birth-year gate
--    (existing accounts with age_band = 'unknown').
--
-- This migration is additive and must be applied through the project's
-- approved Supabase migration workflow, per the precedent set by
-- 20260922010000_coach_accounts_history.sql.

alter table public.profiles
  add column if not exists session_minutes smallint,
  add column if not exists birth_year smallint;

alter table public.profiles
  drop constraint if exists profiles_session_minutes_check,
  add constraint profiles_session_minutes_check check (session_minutes is null or session_minutes between 20 and 90),
  drop constraint if exists profiles_birth_year_check,
  add constraint profiles_birth_year_check check (
    birth_year is null or birth_year between 1900 and extract(year from now())::int
  );

-- Pure, immutable so it can be used in both the trigger below and (if ever
-- needed) directly in SQL views/queries without recomputing "now" each row.
create or replace function public.compute_age_band(p_birth_year smallint)
returns text
language sql
immutable
as $$
  select case
    when p_birth_year is null then 'unknown'
    when (extract(year from now())::int - p_birth_year) < 18 then 'under_18'
    when (extract(year from now())::int - p_birth_year) > 59 then 'over_59'
    else 'adult_18_59'
  end;
$$;

revoke all on function public.compute_age_band(smallint) from public, anon;
grant execute on function public.compute_age_band(smallint) to authenticated, service_role;

-- Registration now optionally sends birth_year in raw_user_meta_data (see
-- app/(auth)/register.tsx). Age band is derived once at insert time so an
-- account created with a birth year never needs the one-time gate.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_birth_year smallint;
begin
  begin
    v_birth_year := nullif(new.raw_user_meta_data->>'birth_year', '')::smallint;
  exception when others then
    v_birth_year := null;
  end;

  insert into public.profiles (
    id, username, display_name, language, preferred_language,
    preferred_units, experience_level, age_band, safety_reviewed_at,
    birth_year
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'username'),
    case when new.raw_user_meta_data->>'language' in ('en', 'es') then new.raw_user_meta_data->>'language' else 'en' end,
    case when new.raw_user_meta_data->>'language' in ('en', 'es') then new.raw_user_meta_data->>'language' else 'en' end,
    'lb', 'beginner',
    coalesce(public.compute_age_band(v_birth_year), 'unknown'),
    null,
    v_birth_year
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Tap-only plan-setup flow (Build My Plan) — minimal foundation.
--
-- This is a scoped-down version of what the redesign line's
-- 20260922010000_coach_accounts_history.sql migration did: only the
-- profiles columns and the two consent/limitation tables the setup wizard
-- itself needs to write. It deliberately does NOT include that migration's
-- account-history-aware Coach router foundation (coach_events, programs,
-- age_band, safety-review routing, etc.) — that's a separate, larger
-- backend change this rebuild has not re-applied.
--
-- Additive only; apply through the project's normal Supabase migration
-- workflow.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists goal text,
  add column if not exists days_per_week smallint,
  add column if not exists session_minutes smallint,
  add column if not exists equipment_type text,
  add column if not exists experience_level text not null default 'beginner',
  add column if not exists safety_reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_days_per_week_check,
  add constraint profiles_days_per_week_check check (days_per_week is null or days_per_week between 1 and 7),
  drop constraint if exists profiles_session_minutes_check,
  add constraint profiles_session_minutes_check check (session_minutes is null or session_minutes between 20 and 90),
  drop constraint if exists profiles_equipment_type_check,
  add constraint profiles_equipment_type_check check (equipment_type is null or equipment_type in ('full_gym', 'dumbbells_home', 'bodyweight')),
  drop constraint if exists profiles_experience_level_check,
  add constraint profiles_experience_level_check check (experience_level in ('beginner', 'intermediate', 'advanced'));

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

-- Sensitive health routing data stays separate from general profile fields.
-- `details` is deliberately optional and never selected by anything other
-- than the setup wizard itself today.
create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('health_data', 'coach_ai_processing', 'privacy_policy')),
  policy_version text not null check (char_length(policy_version) between 1 and 80),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (granted_at is not null or withdrawn_at is not null),
  unique (user_id, consent_type, policy_version)
);

create table if not exists public.user_limitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  limitation_type text not null check (char_length(limitation_type) between 1 and 80),
  details text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_consents_user_created on public.user_consents(user_id, created_at desc);
create index if not exists idx_user_limitations_user_active on public.user_limitations(user_id, active) where active;

alter table public.user_consents enable row level security;
alter table public.user_limitations enable row level security;

revoke all on table public.user_consents, public.user_limitations from anon, authenticated;
grant select, insert, update, delete on public.user_consents, public.user_limitations to authenticated;

drop policy if exists user_consents_select_own on public.user_consents;
drop policy if exists user_consents_insert_own on public.user_consents;
drop policy if exists user_consents_update_own on public.user_consents;
drop policy if exists user_consents_delete_own on public.user_consents;
create policy user_consents_select_own on public.user_consents for select to authenticated using ((select auth.uid()) = user_id);
create policy user_consents_insert_own on public.user_consents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_consents_update_own on public.user_consents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_consents_delete_own on public.user_consents for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists user_limitations_select_own on public.user_limitations;
drop policy if exists user_limitations_insert_own_with_consent on public.user_limitations;
drop policy if exists user_limitations_update_own_with_consent on public.user_limitations;
drop policy if exists user_limitations_delete_own on public.user_limitations;
create policy user_limitations_select_own on public.user_limitations for select to authenticated using ((select auth.uid()) = user_id);
create policy user_limitations_insert_own_with_consent on public.user_limitations for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.user_consents c
    where c.user_id = (select auth.uid()) and c.consent_type = 'health_data'
      and c.granted_at is not null and c.withdrawn_at is null
  )
);
create policy user_limitations_update_own_with_consent on public.user_limitations for update to authenticated using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.user_consents c
    where c.user_id = (select auth.uid()) and c.consent_type = 'health_data'
      and c.granted_at is not null and c.withdrawn_at is null
  )
);
create policy user_limitations_delete_own on public.user_limitations for delete to authenticated using ((select auth.uid()) = user_id);

-- profiles already has RLS enabled and owner policies from the original
-- schema (supabase/schema.sql); the new columns above ride on those
-- existing "auth.uid() = id" select/update policies with no change needed.

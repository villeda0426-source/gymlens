-- Coach account + history foundation. This migration is additive and must be
-- applied through the project's approved Supabase migration workflow; it is
-- intentionally not run by application setup code.
--
-- Privacy boundary: Coach prompts, messages, free-form notes, and model output
-- are not stored in coach events or job observability fields.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists preferred_language text not null default 'en',
  add column if not exists preferred_units text not null default 'lb',
  add column if not exists experience_level text not null default 'beginner',
  add column if not exists goal text,
  add column if not exists equipment_type text,
  add column if not exists days_per_week smallint,
  add column if not exists age_band text not null default 'unknown',
  add column if not exists safety_reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check,
  add constraint profiles_preferred_language_check check (preferred_language in ('en', 'es')),
  drop constraint if exists profiles_preferred_units_check,
  add constraint profiles_preferred_units_check check (preferred_units in ('kg', 'lb')),
  drop constraint if exists profiles_experience_level_check,
  add constraint profiles_experience_level_check check (experience_level in ('beginner', 'intermediate', 'advanced')),
  drop constraint if exists profiles_equipment_type_check,
  add constraint profiles_equipment_type_check check (equipment_type is null or equipment_type in ('full_gym', 'dumbbells_home', 'bodyweight')),
  drop constraint if exists profiles_days_per_week_check,
  add constraint profiles_days_per_week_check check (days_per_week is null or days_per_week between 1 and 7),
  drop constraint if exists profiles_age_band_check,
  add constraint profiles_age_band_check check (age_band in ('unknown', 'under_18', 'adult_18_59', 'over_59'));

update public.profiles
set
  display_name = coalesce(nullif(display_name, ''), nullif(username, '')),
  preferred_language = case when language in ('en', 'es') then language else preferred_language end,
  updated_at = coalesce(updated_at, created_at, now())
where display_name is null
   or display_name = ''
   or preferred_language not in ('en', 'es')
   or updated_at is null;

-- Keep legacy readers functional until every client has moved from
-- username/language to display_name/preferred_language. Metadata only supplies
-- a display default; it is never used for authorization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, username, display_name, language, preferred_language,
    preferred_units, experience_level, age_band, safety_reviewed_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'username'),
    case when new.raw_user_meta_data->>'language' in ('en', 'es') then new.raw_user_meta_data->>'language' else 'en' end,
    case when new.raw_user_meta_data->>'language' in ('en', 'es') then new.raw_user_meta_data->>'language' else 'en' end,
    'lb', 'beginner', 'unknown', null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

insert into public.profiles (
  id, username, display_name, language, preferred_language,
  preferred_units, experience_level, age_band, safety_reviewed_at
)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'username', u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'username'),
  case when u.raw_user_meta_data->>'language' in ('en', 'es') then u.raw_user_meta_data->>'language' else 'en' end,
  case when u.raw_user_meta_data->>'language' in ('en', 'es') then u.raw_user_meta_data->>'language' else 'en' end,
  'lb', 'beginner', 'unknown', null
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;

create index if not exists idx_profiles_safety_reviewed_at on public.profiles(safety_reviewed_at);

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
-- `details` is deliberately optional and never selected by the Coach router.
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

create table if not exists public.exercises (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_en text not null,
  name_es text not null,
  movement_pattern text not null,
  primary_muscles text[] not null default '{}',
  equipment text not null,
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  rationale_en text not null,
  rationale_es text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stable library IDs mirror the deterministic Coach templates. The rationale is
-- catalog data, not a model response, so it remains safe to persist and export.
insert into public.exercises (id, name_en, name_es, movement_pattern, primary_muscles, equipment, difficulty, rationale_en, rationale_es)
values
  ('leg-press', 'Leg Press', 'Prensa de piernas', 'squat', '{quads,glutes}', 'machine', 'beginner', 'Builds a repeatable squat pattern with supported loading.', 'Desarrolla un patrón de sentadilla repetible con carga apoyada.'),
  ('goblet-squat', 'Goblet Squat', 'Sentadilla goblet', 'squat', '{quads,glutes}', 'dumbbell', 'beginner', 'Builds leg strength and squat coordination with a simple front load.', 'Desarrolla fuerza de piernas y coordinación de sentadilla con una carga frontal simple.'),
  ('sit-to-stand-squat', 'Sit-to-Stand Squat', 'Sentadilla a silla', 'squat', '{quads,glutes}', 'bodyweight', 'beginner', 'Introduces controlled squat depth with a stable target.', 'Introduce profundidad de sentadilla controlada con una referencia estable.'),
  ('supported-split-squat', 'Supported Split Squat', 'Zancada dividida con apoyo', 'lunge', '{quads,glutes}', 'bodyweight', 'beginner', 'Builds single-leg strength while support reduces balance demand.', 'Desarrolla fuerza unilateral mientras el apoyo reduce la exigencia de equilibrio.'),
  ('machine-chest-press', 'Machine Chest Press', 'Press de pecho en máquina', 'horizontal_push', '{chest,shoulders,triceps}', 'machine', 'beginner', 'Practices horizontal pressing on a stable path.', 'Practica el empuje horizontal en una trayectoria estable.'),
  ('dumbbell-bench-press', 'Dumbbell Bench Press', 'Press de banca con mancuernas', 'horizontal_push', '{chest,shoulders,triceps}', 'dumbbell', 'beginner', 'Builds horizontal pressing strength with independent hands.', 'Desarrolla fuerza de empuje horizontal con manos independientes.'),
  ('dumbbell-floor-press', 'Dumbbell Floor Press', 'Press de suelo con mancuernas', 'horizontal_push', '{chest,triceps,shoulders}', 'dumbbell', 'beginner', 'Provides a stable limited-range horizontal press.', 'Ofrece un empuje horizontal estable con rango limitado.'),
  ('incline-push-up', 'Incline Push-Up', 'Flexiones inclinadas', 'horizontal_push', '{chest,shoulders,triceps}', 'bodyweight', 'beginner', 'Scales a push-up to a manageable bodyweight press.', 'Escala una flexión a un empuje de peso corporal manejable.'),
  ('seated-cable-row', 'Seated Cable Row', 'Remo sentado en polea', 'horizontal_pull', '{back,biceps}', 'machine', 'beginner', 'Builds upper-back pulling with a stable seated position.', 'Desarrolla tracción de espalda alta desde una posición sentada estable.'),
  ('lat-pulldown', 'Lat Pulldown', 'Jalón al pecho', 'vertical_pull', '{back,biceps}', 'machine', 'beginner', 'Builds a controlled vertical pulling pattern.', 'Desarrolla un patrón de jalón vertical controlado.'),
  ('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'Remo con mancuerna a una mano', 'horizontal_pull', '{back,biceps}', 'dumbbell', 'beginner', 'Builds horizontal pulling one side at a time.', 'Desarrolla tracción horizontal de un lado a la vez.'),
  ('two-dumbbell-bent-over-row', 'Two-Dumbbell Bent-Over Row', 'Remo inclinado con dos mancuernas', 'horizontal_pull', '{back,biceps}', 'dumbbell', 'beginner', 'Builds upper-back pulling with simple dumbbell equipment.', 'Desarrolla tracción de espalda alta con equipo sencillo de mancuernas.'),
  ('seated-dumbbell-shoulder-press', 'Seated Dumbbell Shoulder Press', 'Press de hombros con mancuernas sentado', 'vertical_push', '{shoulders,triceps}', 'dumbbell', 'beginner', 'Builds controlled overhead pressing while seated.', 'Desarrolla empuje por encima de la cabeza controlado estando sentado.'),
  ('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Elevaciones laterales con mancuernas', 'lateral_delt', '{shoulders}', 'dumbbell', 'beginner', 'Adds low-load work for the side of the shoulders.', 'Añade trabajo de baja carga para el lateral de los hombros.'),
  ('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'Peso muerto rumano con mancuernas', 'hinge', '{hamstrings,glutes,back}', 'dumbbell', 'beginner', 'Teaches hip hinging and posterior-chain strength.', 'Enseña la bisagra de cadera y fuerza de la cadena posterior.'),
  ('glute-bridge', 'Glute Bridge', 'Puente de glúteos', 'hinge', '{glutes,hamstrings}', 'bodyweight', 'beginner', 'Builds a simple hip-extension pattern.', 'Desarrolla un patrón simple de extensión de cadera.'),
  ('bodyweight-hip-hinge', 'Bodyweight Hip Hinge', 'Bisagra de cadera con peso corporal', 'hinge', '{hamstrings,glutes}', 'bodyweight', 'beginner', 'Practices a hip hinge before adding load.', 'Practica una bisagra de cadera antes de añadir carga.'),
  ('standing-calf-raise', 'Standing Calf Raise', 'Elevación de talones de pie', 'calf', '{calves}', 'bodyweight', 'beginner', 'Builds calf strength for walking and balance.', 'Desarrolla fuerza de pantorrillas para caminar y equilibrarse.'),
  ('dead-bug', 'Dead Bug', 'Bicho muerto', 'core_stability', '{core}', 'bodyweight', 'beginner', 'Builds trunk control while moving opposite limbs.', 'Desarrolla control del tronco al mover extremidades opuestas.'),
  ('bird-dog', 'Bird Dog', 'Perro de caza', 'core_stability', '{core,glutes}', 'bodyweight', 'beginner', 'Builds trunk stability with a simple contralateral pattern.', 'Desarrolla estabilidad del tronco con un patrón contralateral simple.')
on conflict (id) do update set
  name_en = excluded.name_en, name_es = excluded.name_es, movement_pattern = excluded.movement_pattern,
  primary_muscles = excluded.primary_muscles, equipment = excluded.equipment, difficulty = excluded.difficulty,
  rationale_en = excluded.rationale_en, rationale_es = excluded.rationale_es, updated_at = now();

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('rules', 'ai')),
  goal text,
  goal_type text,
  experience_level text,
  units text check (units in ('kg', 'lbs')),
  timeline_weeks smallint,
  days_per_week smallint,
  split text,
  equipment text[] not null default '{}',
  progression_strategy text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position >= 0),
  day_label text not null,
  focus text not null,
  estimated_minutes smallint not null check (estimated_minutes between 1 and 240),
  unique (program_id, position)
);

create table if not exists public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  plan_session_id uuid not null references public.plan_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  library_exercise_id text references public.exercises(id) on delete set null,
  exercise_name text not null,
  position smallint not null check (position >= 0),
  primary_muscles text[] not null default '{}',
  sets smallint not null check (sets between 0 and 20),
  rep_min smallint not null check (rep_min between 0 and 100),
  rep_max smallint not null check (rep_max between rep_min and 100),
  target_rpe numeric(3,1) check (target_rpe is null or target_rpe between 0 and 10),
  target_load text,
  rest_seconds smallint check (rest_seconds is null or rest_seconds between 0 and 900),
  unique (program_id, exercise_id)
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  plan_session_id uuid references public.plan_sessions(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz not null default now()
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  plan_exercise_id uuid references public.plan_exercises(id) on delete set null,
  exercise_id text not null,
  set_number smallint not null check (set_number between 1 and 50),
  weight numeric(8,2) check (weight is null or weight >= 0),
  reps smallint check (reps is null or reps between 0 and 200),
  rpe numeric(3,1) check (rpe is null or rpe between 0 and 10),
  completed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workout_session_id, exercise_id, set_number)
);

create table if not exists public.coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'rules_response', 'difficulty_easy', 'difficulty_hard', 'missed_workout',
    'soreness_reported', 'substitution_requested', 'plan_generated',
    'response_flagged_unhelpful'
  )),
  route_reason text not null check (route_reason ~ '^[a-z0-9_.:-]{1,96}$'),
  response_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, event_type, response_id)
);

create table if not exists public.user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  insight_key text not null,
  value jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (user_id, insight_key)
);

create index if not exists idx_programs_user_created on public.programs(user_id, created_at desc);
create index if not exists idx_plan_sessions_user_program on public.plan_sessions(user_id, program_id);
create index if not exists idx_plan_exercises_user_program on public.plan_exercises(user_id, program_id);
create index if not exists idx_workout_sessions_user_created on public.workout_sessions(user_id, created_at desc);
create index if not exists idx_set_logs_user_session on public.set_logs(user_id, workout_session_id);
create index if not exists idx_coach_events_user_created on public.coach_events(user_id, created_at desc);
create index if not exists idx_user_insights_user on public.user_insights(user_id);

-- Rebuildable derived insight scaffold. It intentionally derives only opaque
-- counts; implementation can expand it without retaining Coach text.
create or replace function public.rebuild_user_insights(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.user_insights (user_id, insight_key, value, computed_at)
  select p_user_id, 'completed_workout_count', jsonb_build_object('count', count(*)), now()
  from public.workout_sessions
  where user_id = p_user_id and status = 'completed'
  on conflict (user_id, insight_key)
  do update set value = excluded.value, computed_at = excluded.computed_at;
end;
$$;
revoke all on function public.rebuild_user_insights(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_user_insights(uuid) to service_role;

-- Child FKs in the checked-in bootstrap schema are reconciled to cascade so
-- deleting auth.users is the single account-data deletion operation.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'equipment_identifications', 'saved_equipment', 'feedback',
    'completed_exercises', 'muscle_progress', 'muscle_progress_history',
    'app_installations', 'coach_trainer_jobs'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I drop constraint if exists %I', table_name, table_name || '_user_id_fkey');
      execute format('alter table public.%I add constraint %I foreign key (user_id) references public.profiles(id) on delete cascade', table_name, table_name || '_user_id_fkey');
    end if;
  end loop;
end $$;

alter table public.coach_trainer_jobs
  add column if not exists route_reason text;
update public.coach_trainer_jobs set payload = null, result = null;
comment on column public.coach_trainer_jobs.payload is 'Deprecated: intentionally null. Coach request text is never persisted.';
comment on column public.coach_trainer_jobs.result is 'Deprecated: intentionally null. Coach response text is never persisted.';
comment on column public.coach_trainer_jobs.timings is 'Metadata only: rulesHandled, routeReason and non-content timing fields; never prompts, plans, notes, or messages.';

-- Explicit RLS model for every new account/history table. Service-role server
-- code bypasses RLS but must still filter by authenticated user ID.
alter table public.profiles enable row level security;
alter table public.user_consents enable row level security;
alter table public.user_limitations enable row level security;
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.coach_events enable row level security;
alter table public.user_insights enable row level security;

revoke all on table public.profiles, public.user_consents, public.user_limitations,
  public.exercises, public.programs, public.plan_sessions, public.plan_exercises,
  public.workout_sessions, public.set_logs, public.coach_events, public.user_insights
from anon, authenticated;

grant select, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_consents, public.user_limitations,
  public.programs, public.plan_sessions, public.plan_exercises, public.workout_sessions,
  public.set_logs to authenticated;
grant select on public.exercises, public.coach_events, public.user_insights to authenticated;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles for delete to authenticated using ((select auth.uid()) = id);

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

drop policy if exists exercises_select_authenticated on public.exercises;
create policy exercises_select_authenticated on public.exercises for select to authenticated using (true);

-- Identical ownership policies for prescribed and actual user-owned records.
do $$
declare table_name text;
begin
  foreach table_name in array array['programs', 'plan_sessions', 'plan_exercises', 'workout_sessions', 'set_logs'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
  end loop;
end $$;

drop policy if exists coach_events_select_own on public.coach_events;
drop policy if exists user_insights_select_own on public.user_insights;
create policy coach_events_select_own on public.coach_events for select to authenticated using ((select auth.uid()) = user_id);
create policy user_insights_select_own on public.user_insights for select to authenticated using ((select auth.uid()) = user_id);

-- Existing tables retain their current grants until their separately-versioned
-- policies are reconciled. New tables above use one explicit policy per op.

-- Coach accounts and durable prescribed-vs-happened history.
--
-- This migration is intentionally additive for the legacy `profiles` shape. It
-- does not apply itself, and it does not create the untracked ai_usage_events
-- or workout_feedback tables. Apply only together with the server changes that
-- keep coach job payload/result columns null (see the privacy section below).

-- -----------------------------------------------------------------------------
-- Phase 1: account profile, consent, and sensitive limitations
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists preferred_language text,
  add column if not exists preferred_units text,
  add column if not exists experience_level text,
  add column if not exists goal text,
  add column if not exists equipment_type text,
  add column if not exists days_per_week smallint,
  add column if not exists age_band text,
  add column if not exists safety_reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Preserve legacy username/language rows while making the new settings explicit.
update public.profiles
set
  display_name = coalesce(display_name, username),
  preferred_language = coalesce(
    preferred_language,
    case when language in ('en', 'es') then language else 'en' end
  ),
  preferred_units = coalesce(preferred_units, 'kg'),
  experience_level = coalesce(experience_level, 'beginner'),
  age_band = coalesce(age_band, 'unknown'),
  updated_at = coalesce(updated_at, now());

alter table public.profiles
  alter column preferred_language set default 'en',
  alter column preferred_language set not null,
  alter column preferred_units set default 'kg',
  alter column preferred_units set not null,
  alter column experience_level set default 'beginner',
  alter column experience_level set not null,
  alter column age_band set default 'unknown',
  alter column age_band set not null;

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check,
  drop constraint if exists profiles_preferred_units_check,
  drop constraint if exists profiles_experience_level_check,
  drop constraint if exists profiles_equipment_type_check,
  drop constraint if exists profiles_days_per_week_check,
  drop constraint if exists profiles_age_band_check;

alter table public.profiles
  add constraint profiles_preferred_language_check
    check (preferred_language in ('en', 'es')),
  add constraint profiles_preferred_units_check
    check (preferred_units in ('kg', 'lb')),
  add constraint profiles_experience_level_check
    check (experience_level in ('beginner', 'intermediate', 'advanced')),
  add constraint profiles_equipment_type_check
    check (equipment_type is null or equipment_type in ('full_gym', 'dumbbells_home', 'bodyweight')),
  add constraint profiles_days_per_week_check
    check (days_per_week is null or days_per_week between 1 and 7),
  add constraint profiles_age_band_check
    check (age_band in ('unknown', 'under_18', 'adult_18_59', 'over_59'));

-- Existing databases used a non-cascading FK. Replace every FK from
-- profiles.id to auth.users.id so deleting an Auth user removes their account
-- row and all dependent user data below. The loop makes reruns safe when the
-- original constraint had a generated name.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', constraint_name);
  end loop;

  alter table public.profiles
    add constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade;
end;
$$;

-- Metadata is used only as a display-name seed. It is never consulted by RLS
-- policies or server-side authorization.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    username,
    display_name,
    preferred_language,
    preferred_units,
    experience_level,
    age_band
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'username',
      new.raw_user_meta_data->>'name'
    ),
    'en',
    'kg',
    'beginner',
    'unknown'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Some early environments had the function but not its trigger. Create it
-- once without dropping an existing auth trigger.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'auth.users'::regclass
      and tgname = 'on_auth_user_created'
      and not tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end;
$$;

-- Backfill every existing Auth user. Existing explicit profile selections win;
-- this does not turn mutable auth metadata into an authorization source.
insert into public.profiles as profile (
  id,
  username,
  display_name,
  preferred_language,
  preferred_units,
  experience_level,
  age_band
)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'username',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name'
  ),
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'username',
    u.raw_user_meta_data->>'name'
  ),
  'en',
  'kg',
  'beginner',
  'unknown'
from auth.users as u
on conflict (id) do update
set
  display_name = coalesce(profile.display_name, excluded.display_name),
  preferred_language = coalesce(profile.preferred_language, excluded.preferred_language),
  preferred_units = coalesce(profile.preferred_units, excluded.preferred_units),
  experience_level = coalesce(profile.experience_level, excluded.experience_level),
  age_band = coalesce(profile.age_band, excluded.age_band),
  updated_at = now();

create or replace function public.set_coach_account_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists coach_account_profiles_updated_at on public.profiles;
create trigger coach_account_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_coach_account_updated_at();

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('health_data', 'ai_processing', 'privacy_policy', 'terms_of_service')),
  policy_version text not null check (char_length(policy_version) between 1 and 120),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (withdrawn_at is null or withdrawn_at >= granted_at),
  unique (user_id, consent_type, policy_version)
);

create table if not exists public.user_limitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  limitation_type text not null check (limitation_type in ('injury', 'condition', 'medication', 'pregnancy_postpartum', 'other')),
  -- Health details stay isolated from profile and Coach event tables. The
  -- router reads only presence/type, never this field.
  details text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists coach_account_consents_updated_at on public.user_consents;
create trigger coach_account_consents_updated_at
  before update on public.user_consents
  for each row execute procedure public.set_coach_account_updated_at();

drop trigger if exists coach_account_limitations_updated_at on public.user_limitations;
create trigger coach_account_limitations_updated_at
  before update on public.user_limitations
  for each row execute procedure public.set_coach_account_updated_at();

create index if not exists idx_user_consents_user_type_created
  on public.user_consents(user_id, consent_type, created_at desc);
create index if not exists idx_user_limitations_user_active
  on public.user_limitations(user_id, active) where active;

-- -----------------------------------------------------------------------------
-- Phase 2: prescribed plan, performed workout, and non-message Coach history
-- -----------------------------------------------------------------------------

create table if not exists public.exercises (
  -- String ids deliberately match Coach's stable, language-independent ids.
  id text primary key check (char_length(id) between 1 and 160),
  name text not null,
  name_es text not null,
  movement_pattern text not null check (movement_pattern in (
    'squat', 'lunge', 'hinge', 'horizontal_push', 'vertical_push',
    'horizontal_pull', 'vertical_pull', 'lateral_delt', 'calf', 'core_stability'
  )),
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment_type text not null check (equipment_type in ('machine', 'dumbbell', 'bodyweight')),
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  rationale_en text not null,
  rationale_es text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('rules', 'ai', 'manual')),
  goal text,
  goal_type text check (goal_type is null or goal_type in ('strength', 'hypertrophy', 'fat_loss', 'endurance', 'general_fitness', 'sport_specific')),
  experience_level text check (experience_level is null or experience_level in ('beginner', 'intermediate', 'advanced')),
  units text check (units is null or units in ('kg', 'lb')),
  timeline_weeks smallint check (timeline_weeks is null or timeline_weeks between 1 and 52),
  days_per_week smallint check (days_per_week is null or days_per_week between 1 and 7),
  split text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_number smallint not null default 1 check (week_number between 1 and 52),
  day_number smallint not null check (day_number between 1 and 7),
  day_label text,
  focus text,
  estimated_minutes smallint check (estimated_minutes is null or estimated_minutes between 1 and 300),
  created_at timestamptz not null default now(),
  unique (program_id, week_number, day_number)
);

create table if not exists public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  plan_session_id uuid not null references public.plan_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- stable_exercise_id is the unique plan-instance id. exercise_id points to
  -- the reusable catalog row when the movement came from the rules library.
  stable_exercise_id text not null check (char_length(stable_exercise_id) between 1 and 200),
  exercise_id text references public.exercises(id) on delete set null,
  exercise_name text not null,
  ordinal smallint not null check (ordinal between 1 and 99),
  prescribed_sets smallint not null check (prescribed_sets between 1 and 20),
  rep_min smallint not null check (rep_min between 0 and 200),
  rep_max smallint not null check (rep_max between rep_min and 200),
  target_rpe numeric(3, 1) check (target_rpe is null or target_rpe between 0 and 10),
  rest_seconds smallint check (rest_seconds is null or rest_seconds between 0 and 1800),
  target_load_text text,
  progression_rule text,
  created_at timestamptz not null default now(),
  unique (plan_session_id, ordinal),
  unique (program_id, stable_exercise_id)
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  plan_session_id uuid references public.plan_sessions(id) on delete set null,
  client_session_id uuid,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at),
  unique (user_id, client_session_id)
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  plan_exercise_id uuid references public.plan_exercises(id) on delete set null,
  exercise_id text references public.exercises(id) on delete set null,
  set_number smallint not null check (set_number between 1 and 99),
  weight numeric(8, 2) check (weight is null or weight >= 0),
  weight_unit text check (weight_unit is null or weight_unit in ('kg', 'lb')),
  reps smallint check (reps is null or reps between 0 and 1000),
  rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
  completed boolean not null default false,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_id, plan_exercise_id, set_number)
);

create table if not exists public.coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  program_id uuid references public.programs(id) on delete set null,
  workout_session_id uuid references public.workout_sessions(id) on delete set null,
  response_id uuid,
  event_type text not null check (event_type in (
    'rules_response', 'difficulty_easy', 'difficulty_hard', 'missed_workout',
    'soreness_reported', 'substitution_requested', 'plan_generated',
    'response_flagged_unhelpful'
  )),
  route_reason text check (route_reason is null or char_length(route_reason) between 1 and 160),
  -- Whitelisted structured metadata only. No prompt, response, message, or
  -- free-form content is accepted here.
  metadata jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(metadata) = 'object'
      and not (metadata ?| array['message', 'messages', 'text', 'prompt', 'response', 'content', 'raw'])
    ),
  created_at timestamptz not null default now()
);

create table if not exists public.user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  insight_type text not null check (insight_type in ('training_activity', 'adherence', 'volume', 'progression', 'recovery')),
  insight_value jsonb not null check (jsonb_typeof(insight_value) = 'object'),
  source_window_start timestamptz,
  source_window_end timestamptz,
  generated_at timestamptz not null default now(),
  generator_version text not null default 'v1',
  unique (user_id, insight_type, generator_version)
);

drop trigger if exists coach_account_exercises_updated_at on public.exercises;
create trigger coach_account_exercises_updated_at
  before update on public.exercises
  for each row execute procedure public.set_coach_account_updated_at();

drop trigger if exists coach_account_programs_updated_at on public.programs;
create trigger coach_account_programs_updated_at
  before update on public.programs
  for each row execute procedure public.set_coach_account_updated_at();

drop trigger if exists coach_account_workout_sessions_updated_at on public.workout_sessions;
create trigger coach_account_workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute procedure public.set_coach_account_updated_at();

drop trigger if exists coach_account_set_logs_updated_at on public.set_logs;
create trigger coach_account_set_logs_updated_at
  before update on public.set_logs
  for each row execute procedure public.set_coach_account_updated_at();

create index if not exists idx_programs_user_created
  on public.programs(user_id, created_at desc);
create index if not exists idx_plan_sessions_program
  on public.plan_sessions(program_id, week_number, day_number);
create index if not exists idx_plan_sessions_user
  on public.plan_sessions(user_id, created_at desc);
create index if not exists idx_plan_exercises_program
  on public.plan_exercises(program_id, stable_exercise_id);
create index if not exists idx_plan_exercises_session
  on public.plan_exercises(plan_session_id, ordinal);
create index if not exists idx_plan_exercises_user
  on public.plan_exercises(user_id, created_at desc);
create index if not exists idx_plan_exercises_exercise
  on public.plan_exercises(exercise_id);
create index if not exists idx_workout_sessions_user_started
  on public.workout_sessions(user_id, started_at desc);
create index if not exists idx_workout_sessions_program
  on public.workout_sessions(program_id);
create index if not exists idx_workout_sessions_plan_session
  on public.workout_sessions(plan_session_id);
create index if not exists idx_set_logs_user_performed
  on public.set_logs(user_id, performed_at desc);
create index if not exists idx_set_logs_workout_session
  on public.set_logs(workout_session_id, set_number);
create index if not exists idx_set_logs_plan_exercise
  on public.set_logs(plan_exercise_id);
create index if not exists idx_set_logs_exercise
  on public.set_logs(exercise_id);
create index if not exists idx_coach_events_user_created
  on public.coach_events(user_id, created_at desc);
create index if not exists idx_coach_events_user_type_created
  on public.coach_events(user_id, event_type, created_at desc);
create index if not exists idx_coach_events_program
  on public.coach_events(program_id);
create index if not exists idx_coach_events_workout_session
  on public.coach_events(workout_session_id);
create index if not exists idx_user_insights_user_generated
  on public.user_insights(user_id, generated_at desc);

-- Derived insight records can always be discarded and rebuilt from session/set
-- data. It is an internal service operation, not a public RPC.
create or replace function public.rebuild_user_insights(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  window_start timestamptz := now() - interval '28 days';
  completed_workouts integer;
  completed_sets integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  select count(*)::integer
    into completed_workouts
    from public.workout_sessions
    where user_id = p_user_id
      and status = 'completed'
      and started_at >= window_start;

  select count(*)::integer
    into completed_sets
    from public.set_logs
    where user_id = p_user_id
      and completed
      and performed_at >= window_start;

  delete from public.user_insights where user_id = p_user_id;

  insert into public.user_insights (
    user_id,
    insight_type,
    insight_value,
    source_window_start,
    source_window_end,
    generator_version
  ) values (
    p_user_id,
    'training_activity',
    jsonb_build_object(
      'completedWorkouts28d', completed_workouts,
      'completedSets28d', completed_sets
    ),
    window_start,
    now(),
    'v1'
  );
end;
$$;

revoke all on function public.rebuild_user_insights(uuid) from public, anon, authenticated;
grant execute on function public.rebuild_user_insights(uuid) to service_role;

-- The starter Coach move library is intentionally explicit rather than AI-
-- generated. Plan rows refer to these durable IDs when possible.
insert into public.exercises (
  id, name, name_es, movement_pattern, primary_muscles, equipment_type,
  difficulty, rationale_en, rationale_es
) values
  ('leg-press', 'Leg Press', 'Prensa de piernas', 'squat', array['quads', 'glutes'], 'machine', 'beginner', 'A stable squat pattern for beginner leg strength.', 'Un patrón de sentadilla estable para fuerza inicial de piernas.'),
  ('goblet-squat', 'Goblet Squat', 'Sentadilla goblet', 'squat', array['quads', 'glutes'], 'dumbbell', 'beginner', 'Builds squat skill with a manageable front load.', 'Desarrolla la técnica de sentadilla con una carga frontal manejable.'),
  ('sit-to-stand-squat', 'Sit-to-Stand Squat', 'Sentadilla a silla', 'squat', array['quads', 'glutes'], 'bodyweight', 'beginner', 'A supported way to practice the squat pattern.', 'Una forma con apoyo de practicar el patrón de sentadilla.'),
  ('supported-split-squat', 'Supported Split Squat', 'Zancada dividida con apoyo', 'lunge', array['quads', 'glutes'], 'bodyweight', 'beginner', 'Builds single-leg strength while support reduces balance demand.', 'Desarrolla fuerza unilateral mientras el apoyo reduce la demanda de equilibrio.'),
  ('machine-chest-press', 'Machine Chest Press', 'Press de pecho en máquina', 'horizontal_push', array['chest', 'shoulders', 'triceps'], 'machine', 'beginner', 'A stable horizontal press for chest and triceps.', 'Un empuje horizontal estable para pecho y tríceps.'),
  ('dumbbell-bench-press', 'Dumbbell Bench Press', 'Press de banca con mancuernas', 'horizontal_push', array['chest', 'shoulders', 'triceps'], 'dumbbell', 'beginner', 'Builds controlled horizontal pressing strength.', 'Desarrolla fuerza de empuje horizontal controlada.'),
  ('dumbbell-floor-press', 'Dumbbell Floor Press', 'Press de suelo con mancuernas', 'horizontal_push', array['chest', 'triceps', 'shoulders'], 'dumbbell', 'beginner', 'A home-friendly press with a naturally limited range.', 'Un empuje para casa con un rango naturalmente limitado.'),
  ('incline-push-up', 'Incline Push-Up', 'Flexiones inclinadas', 'horizontal_push', array['chest', 'shoulders', 'triceps'], 'bodyweight', 'beginner', 'Scales pushing practice to a manageable bodyweight load.', 'Ajusta la práctica de empuje a una carga corporal manejable.'),
  ('seated-cable-row', 'Seated Cable Row', 'Remo sentado en polea', 'horizontal_pull', array['back', 'biceps'], 'machine', 'beginner', 'Balances pressing with a supported rowing pattern.', 'Equilibra los empujes con un patrón de remo con apoyo.'),
  ('lat-pulldown', 'Lat Pulldown', 'Jalón al pecho', 'vertical_pull', array['back', 'biceps'], 'machine', 'beginner', 'Builds vertical pulling strength with a controllable load.', 'Desarrolla fuerza de jalón vertical con una carga controlable.'),
  ('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'Remo con mancuerna a una mano', 'horizontal_pull', array['back', 'biceps'], 'dumbbell', 'beginner', 'A supported dumbbell row for upper-back strength.', 'Un remo con mancuerna con apoyo para fuerza de espalda alta.'),
  ('two-dumbbell-bent-over-row', 'Two-Dumbbell Bent-Over Row', 'Remo inclinado con dos mancuernas', 'horizontal_pull', array['back', 'biceps'], 'dumbbell', 'beginner', 'Builds rowing strength when a bench is unavailable.', 'Desarrolla fuerza de remo cuando no hay banco disponible.'),
  ('prone-y-raise', 'Prone Y Raise', 'Elevación en Y boca abajo', 'horizontal_pull', array['back', 'shoulders'], 'bodyweight', 'beginner', 'Adds light upper-back and shoulder-control work.', 'Añade trabajo suave de espalda alta y control de hombro.'),
  ('prone-t-raise', 'Prone T Raise', 'Elevación en T boca abajo', 'horizontal_pull', array['back', 'shoulders'], 'bodyweight', 'beginner', 'Adds light upper-back work without equipment.', 'Añade trabajo suave de espalda alta sin equipo.'),
  ('seated-dumbbell-shoulder-press', 'Seated Dumbbell Shoulder Press', 'Press de hombros con mancuernas sentado', 'vertical_push', array['shoulders', 'triceps'], 'dumbbell', 'beginner', 'Builds controlled overhead pressing strength.', 'Desarrolla fuerza de empuje sobre la cabeza de forma controlada.'),
  ('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Elevaciones laterales con mancuernas', 'lateral_delt', array['shoulders'], 'dumbbell', 'beginner', 'Adds low-load work for the side of the shoulders.', 'Añade trabajo de baja carga para el lateral de los hombros.'),
  ('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'Peso muerto rumano con mancuernas', 'hinge', array['hamstrings', 'glutes', 'back'], 'dumbbell', 'beginner', 'Practices a loaded hip hinge for hamstrings and glutes.', 'Practica una bisagra de cadera con carga para isquiotibiales y glúteos.'),
  ('glute-bridge', 'Glute Bridge', 'Puente de glúteos', 'hinge', array['glutes', 'hamstrings'], 'bodyweight', 'beginner', 'Introduces hip extension with a simple bodyweight pattern.', 'Introduce la extensión de cadera con un patrón simple de peso corporal.'),
  ('bodyweight-hip-hinge', 'Bodyweight Hip Hinge', 'Bisagra de cadera con peso corporal', 'hinge', array['hamstrings', 'glutes'], 'bodyweight', 'beginner', 'Teaches hip-hinge mechanics before adding load.', 'Enseña la mecánica de bisagra de cadera antes de añadir carga.'),
  ('standing-calf-raise', 'Standing Calf Raise', 'Elevación de talones de pie', 'calf', array['calves'], 'bodyweight', 'beginner', 'Builds calf strength for walking, running, and balance.', 'Desarrolla fuerza de pantorrilla para caminar, correr y equilibrarse.'),
  ('dead-bug', 'Dead Bug', 'Bicho muerto', 'core_stability', array['core'], 'bodyweight', 'beginner', 'Builds trunk control while the limbs move.', 'Desarrolla control del tronco mientras se mueven las extremidades.'),
  ('bird-dog', 'Bird Dog', 'Perro de caza', 'core_stability', array['core', 'glutes'], 'bodyweight', 'beginner', 'Builds core stability and controlled contralateral movement.', 'Desarrolla estabilidad del core y movimiento contralateral controlado.')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- RLS and public-schema privileges
-- -----------------------------------------------------------------------------

-- Every user-owned public table is RLS-protected. Policies are deliberately
-- separated by operation so UPDATE includes both USING and WITH CHECK.
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

revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Profile: select own" on public.profiles;
drop policy if exists "Profile: insert own" on public.profiles;
drop policy if exists "Profile: update own" on public.profiles;
drop policy if exists "Profile: delete own" on public.profiles;
create policy "Profile: select own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "Profile: insert own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Profile: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
create policy "Profile: delete own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

revoke all on table public.user_consents from public, anon, authenticated;
grant select, insert, update, delete on table public.user_consents to authenticated;
grant select, insert, update, delete on table public.user_consents to service_role;
drop policy if exists "Consent: select own" on public.user_consents;
drop policy if exists "Consent: insert own" on public.user_consents;
drop policy if exists "Consent: update own" on public.user_consents;
drop policy if exists "Consent: delete own" on public.user_consents;
create policy "Consent: select own" on public.user_consents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Consent: insert own" on public.user_consents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Consent: update own" on public.user_consents
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Consent: delete own" on public.user_consents
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.user_limitations from public, anon, authenticated;
grant select, insert, update, delete on table public.user_limitations to authenticated;
grant select, insert, update, delete on table public.user_limitations to service_role;
drop policy if exists "Limitation: select own" on public.user_limitations;
drop policy if exists "Limitation: insert own with health consent" on public.user_limitations;
drop policy if exists "Limitation: update own with health consent" on public.user_limitations;
drop policy if exists "Limitation: delete own" on public.user_limitations;
create policy "Limitation: select own" on public.user_limitations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Limitation: insert own with health consent" on public.user_limitations
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_consents as consent
      where consent.user_id = (select auth.uid())
        and consent.consent_type = 'health_data'
        and consent.withdrawn_at is null
    )
  );
create policy "Limitation: update own with health consent" on public.user_limitations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.user_consents as consent
      where consent.user_id = (select auth.uid())
        and consent.consent_type = 'health_data'
        and consent.withdrawn_at is null
    )
  );
create policy "Limitation: delete own" on public.user_limitations
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.exercises from public, anon, authenticated;
grant select on table public.exercises to authenticated;
grant select, insert, update, delete on table public.exercises to service_role;
drop policy if exists "Exercise catalog: authenticated select" on public.exercises;
create policy "Exercise catalog: authenticated select" on public.exercises
  for select to authenticated using (true);

revoke all on table public.programs from public, anon, authenticated;
grant select on table public.programs to authenticated;
grant select, insert, update, delete on table public.programs to service_role;
drop policy if exists "Program: select own" on public.programs;
create policy "Program: select own" on public.programs
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.plan_sessions from public, anon, authenticated;
grant select on table public.plan_sessions to authenticated;
grant select, insert, update, delete on table public.plan_sessions to service_role;
drop policy if exists "Plan session: select own" on public.plan_sessions;
create policy "Plan session: select own" on public.plan_sessions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.plan_exercises from public, anon, authenticated;
grant select on table public.plan_exercises to authenticated;
grant select, insert, update, delete on table public.plan_exercises to service_role;
drop policy if exists "Plan exercise: select own" on public.plan_exercises;
create policy "Plan exercise: select own" on public.plan_exercises
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.workout_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_sessions to service_role;
drop policy if exists "Workout session: select own" on public.workout_sessions;
drop policy if exists "Workout session: insert own" on public.workout_sessions;
drop policy if exists "Workout session: update own" on public.workout_sessions;
drop policy if exists "Workout session: delete own" on public.workout_sessions;
create policy "Workout session: select own" on public.workout_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Workout session: insert own" on public.workout_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Workout session: update own" on public.workout_sessions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Workout session: delete own" on public.workout_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.set_logs from public, anon, authenticated;
grant select, insert, update, delete on table public.set_logs to authenticated;
grant select, insert, update, delete on table public.set_logs to service_role;
drop policy if exists "Set log: select own" on public.set_logs;
drop policy if exists "Set log: insert own" on public.set_logs;
drop policy if exists "Set log: update own" on public.set_logs;
drop policy if exists "Set log: delete own" on public.set_logs;
create policy "Set log: select own" on public.set_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Set log: insert own" on public.set_logs
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workout_sessions as workout
      where workout.id = workout_session_id
        and workout.user_id = (select auth.uid())
    )
  );
create policy "Set log: update own" on public.set_logs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.workout_sessions as workout
      where workout.id = workout_session_id
        and workout.user_id = (select auth.uid())
    )
  );
create policy "Set log: delete own" on public.set_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.coach_events from public, anon, authenticated;
grant select on table public.coach_events to authenticated;
grant select, insert, update, delete on table public.coach_events to service_role;
drop policy if exists "Coach event: select own" on public.coach_events;
create policy "Coach event: select own" on public.coach_events
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.user_insights from public, anon, authenticated;
grant select on table public.user_insights to authenticated;
grant select, insert, update, delete on table public.user_insights to service_role;
drop policy if exists "Insight: select own" on public.user_insights;
create policy "Insight: select own" on public.user_insights
  for select to authenticated using ((select auth.uid()) = user_id);

-- Existing user-owned tables predate the account model. Convert their profile
-- FKs to cascades without assuming generated constraint names, and add any
-- missing user-id indexes needed by cascades and ownership filters.
do $$
declare
  target_table text;
  constraint_name text;
begin
  foreach target_table in array array[
    'equipment_identifications',
    'saved_equipment',
    'feedback',
    'app_installations',
    'coach_trainer_jobs',
    'completed_exercises',
    'muscle_progress',
    'muscle_progress_history'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'user_id'
    ) then
      for constraint_name in
        select conname
        from pg_constraint
        where conrelid = format('public.%I', target_table)::regclass
          and contype = 'f'
          and confrelid = 'public.profiles'::regclass
      loop
        execute format('alter table public.%I drop constraint %I', target_table, constraint_name);
      end loop;

      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references public.profiles(id) on delete cascade',
        target_table,
        target_table || '_user_id_profiles_cascade_fkey'
      );
      execute format(
        'create index if not exists %I on public.%I (user_id)',
        'idx_' || target_table || '_user_id',
        target_table
      );
    end if;
  end loop;
end;
$$;

-- Coach jobs are an execution ledger, not a transcript store. The database
-- retains only status + route metadata. Existing payload/result/error values
-- are intentionally removed before constraints make future raw writes fail.
alter table public.coach_trainer_jobs
  add column if not exists route_reason text,
  add column if not exists failure_code text;

update public.coach_trainer_jobs
set payload = null,
    result = null,
    error = null,
    timings = '{}'::jsonb;

alter table public.coach_trainer_jobs
  drop constraint if exists coach_trainer_jobs_payload_must_be_null,
  drop constraint if exists coach_trainer_jobs_result_must_be_null,
  drop constraint if exists coach_trainer_jobs_error_must_be_null,
  drop constraint if exists coach_trainer_jobs_route_reason_length,
  drop constraint if exists coach_trainer_jobs_failure_code_length,
  drop constraint if exists coach_trainer_jobs_timings_metadata_only;

alter table public.coach_trainer_jobs
  add constraint coach_trainer_jobs_payload_must_be_null check (payload is null),
  add constraint coach_trainer_jobs_result_must_be_null check (result is null),
  add constraint coach_trainer_jobs_error_must_be_null check (error is null),
  add constraint coach_trainer_jobs_route_reason_length
    check (route_reason is null or char_length(route_reason) between 1 and 160),
  add constraint coach_trainer_jobs_failure_code_length
    check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{0,79}$'),
  add constraint coach_trainer_jobs_timings_metadata_only
    check (
      jsonb_typeof(timings) = 'object'
      and timings - 'rulesHandled' - 'routeReason' = '{}'::jsonb
      and (not (timings ? 'rulesHandled') or jsonb_typeof(timings->'rulesHandled') = 'boolean')
      and (not (timings ? 'routeReason') or jsonb_typeof(timings->'routeReason') = 'string')
    );

alter table public.coach_trainer_jobs enable row level security;
revoke all on table public.coach_trainer_jobs from public, anon, authenticated;
grant select on table public.coach_trainer_jobs to authenticated;
grant select, insert, update, delete on table public.coach_trainer_jobs to service_role;
drop policy if exists "Users view own coach trainer jobs" on public.coach_trainer_jobs;
drop policy if exists "Coach job: select own" on public.coach_trainer_jobs;
create policy "Coach job: select own" on public.coach_trainer_jobs
  for select to authenticated using ((select auth.uid()) = user_id);

comment on column public.coach_trainer_jobs.timings is
  'Metadata only: optional rulesHandled boolean and routeReason string. Never prompts, plans, message text, or timings that encode content.';
comment on column public.coach_trainer_jobs.route_reason is
  'Privacy-safe routing reason, not user message text.';
comment on table public.user_limitations is
  'Sensitive health-adjacent data. Require separate health_data consent and never put this content in Coach event logs.';
comment on table public.coach_events is
  'Structured Coach events only; prompts and responses are intentionally not stored.';

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  username text,
  language text default 'en',
  guest_uses int default 0,
  created_at timestamptz default now()
);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Equipment master catalog
create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_es text,
  category text check (category in ('machine', 'free_weight', 'cable', 'accessory', 'cardio', 'bodyweight')),
  description text,
  description_es text,
  muscle_groups text[],
  difficulty text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tutorial_steps jsonb,
  safety_tips text[],
  safety_tips_es text[],
  image_url text,
  created_at timestamptz default now()
);

-- AI Identification results
create table equipment_identifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  equipment_id uuid references equipment(id),
  image_url text,
  raw_result jsonb,
  confidence float,
  created_at timestamptz default now()
);

-- Curated video links
create table equipment_videos (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid references equipment(id),
  youtube_id text not null unique,
  title text,
  thumbnail_url text,
  duration text,
  language text default 'en',
  curator_approved boolean default false,
  created_at timestamptz default now()
);

-- User saved equipment
create table saved_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  equipment_id uuid references equipment(id),
  saved_at timestamptz default now(),
  unique(user_id, equipment_id)
);

-- Feedback
create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  identification_id uuid references equipment_identifications(id),
  rating int check (rating between 1 and 5),
  category text check (category in ('wrong_id', 'missing_info', 'video_quality', 'other')),
  message text,
  created_at timestamptz default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table equipment enable row level security;
alter table equipment_identifications enable row level security;
alter table saved_equipment enable row level security;
alter table equipment_videos enable row level security;
alter table feedback enable row level security;

-- Profiles: users can only read/update their own
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Equipment: public read
create policy "Equipment is publicly readable" on equipment for select using (true);

-- Identifications: users see own
create policy "Users see own identifications" on equipment_identifications for select using (auth.uid() = user_id);
create policy "Users insert own identifications" on equipment_identifications for insert with check (auth.uid() = user_id);

-- Saved: users manage own
create policy "Users manage own saved equipment" on saved_equipment for all using (auth.uid() = user_id);

-- Videos: public read
create policy "Videos are publicly readable" on equipment_videos for select using (true);

-- Feedback: users insert own
create policy "Users submit own feedback" on feedback for insert with check (auth.uid() = user_id or user_id is null);

-- Indexes
create index idx_equipment_category on equipment(category);
create index idx_identifications_user on equipment_identifications(user_id);
create index idx_saved_user on saved_equipment(user_id);
create index idx_videos_equipment on equipment_videos(equipment_id);

-- App installations are created anonymously on first launch and linked to a
-- Supabase account after signup. Server/service-role access only.
create table app_installations (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null unique,
  user_id uuid references profiles(id) on delete set null,
  platform text,
  app_version text,
  build_number integer,
  locale text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table app_installations enable row level security;
revoke all on table app_installations from public, anon, authenticated;
grant select, insert, update, delete on table app_installations to service_role;
create index idx_app_installations_user on app_installations(user_id);
create index idx_app_installations_created on app_installations(created_at desc);

-- Async AI trainer plan generation jobs
create table coach_trainer_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  idempotency_key text check (
    idempotency_key is null
    or char_length(idempotency_key) between 16 and 200
  ),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  payload jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table coach_trainer_jobs enable row level security;

create index idx_coach_trainer_jobs_user_created
  on coach_trainer_jobs(user_id, created_at desc);

create unique index coach_trainer_jobs_user_idempotency_key
  on coach_trainer_jobs(user_id, idempotency_key)
  where idempotency_key is not null;

create policy "Users view own coach trainer jobs"
  on coach_trainer_jobs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table coach_trainer_jobs from anon;
grant select on table coach_trainer_jobs to authenticated;
grant select, insert, update, delete on table coach_trainer_jobs to service_role;

-- ============================================================
-- Dynamic Muscle Avatar
-- ============================================================

-- Denormalized log of completed exercises. Exercises come from the AI Trainer
-- (AsyncStorage-only, never persisted to Supabase), so there is no exercise
-- catalog to foreign-key into — each row snapshots the muscles at completion time.
create table completed_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  exercise_slug text not null,
  exercise_name text not null,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  client_log_id uuid not null,
  completed_at timestamptz default now(),
  unique(user_id, client_log_id)
);

-- One row per user per canonical muscle group; cumulative score + derived level.
create table muscle_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  muscle_group text not null check (muscle_group in (
    'chest', 'back', 'shoulders', 'biceps', 'triceps',
    'core', 'glutes', 'quads', 'hamstrings', 'calves'
  )),
  score int not null default 0,
  level int not null default 0,
  last_updated timestamptz default now(),
  unique(user_id, muscle_group)
);

-- Append-only event log behind muscle_progress, so weekly/monthly views are just
-- sum(delta) grouped by date_trunc(recorded_at).
create table muscle_progress_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  muscle_group text not null,
  delta int not null,
  score_after int not null,
  level_after int not null,
  reason text not null default 'exercise' check (reason in ('exercise', 'consistency_bonus')),
  recorded_at timestamptz default now()
);

-- Mirrors the level thresholds used by the avatar UI (lib/muscleProgress.ts's
-- levelForScore must be kept in sync with this).
create or replace function muscle_level_for_score(score int)
returns int
language sql
immutable
as $$
  select case
    when score >= 500 then 5
    when score >= 300 then 4
    when score >= 150 then 3
    when score >= 50 then 2
    when score >= 1 then 1
    else 0
  end;
$$;

-- Records a completed exercise and updates muscle_progress in one transaction.
-- Idempotent on (user_id, client_log_id): resubmitting the same client_log_id
-- is a no-op. Reads auth.uid() internally rather than trusting a caller-supplied
-- user id. security invoker (default) so RLS on every table touched still applies
-- as a second independent backstop.
create or replace function complete_exercise(
  p_exercise_slug text,
  p_exercise_name text,
  p_primary_muscles text[],
  p_secondary_muscles text[],
  p_client_log_id uuid
)
returns table (
  muscle_group text,
  base_delta int,
  bonus_delta int,
  total_delta int,
  new_score int,
  new_level int,
  leveled_up boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted_id uuid;
  v_today date := (now() at time zone 'utc')::date;
  v_week_start date := date_trunc('week', v_today)::date;
  v_days_before_today int;
  v_already_logged_today boolean;
  v_bonus int := 0;
  v_primary text[];
  v_secondary text[];
  v_all_muscles text[];
  v_muscle text;
  v_base_delta int;
  v_old_level int;
  v_score_after int;
  v_level_after int;
begin
  if v_user_id is null then
    raise exception 'complete_exercise requires an authenticated user';
  end if;

  insert into completed_exercises (
    user_id, exercise_slug, exercise_name, primary_muscles, secondary_muscles, client_log_id
  ) values (
    v_user_id, p_exercise_slug, p_exercise_name,
    coalesce(p_primary_muscles, '{}'::text[]), coalesce(p_secondary_muscles, '{}'::text[]),
    p_client_log_id
  )
  on conflict (user_id, client_log_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    -- Duplicate submission of the same client_log_id: no-op, no muscle deltas.
    return;
  end if;

  -- Consistency bonus: a flat +20 awarded once per muscle, on the day the user
  -- crosses 3 distinct workout days in the current week (Mon-Sun, UTC). Never
  -- retroactive to earlier days, never re-awarded later the same day.
  select count(distinct (completed_at at time zone 'utc')::date)
    into v_days_before_today
    from completed_exercises
    where user_id = v_user_id
      and id <> v_inserted_id
      and (completed_at at time zone 'utc')::date >= v_week_start
      and (completed_at at time zone 'utc')::date < v_today;

  select exists (
    select 1 from completed_exercises
    where user_id = v_user_id
      and id <> v_inserted_id
      and (completed_at at time zone 'utc')::date = v_today
  ) into v_already_logged_today;

  if v_days_before_today = 2 and not v_already_logged_today then
    v_bonus := 20;
  end if;

  -- Primary muscles win on overlap with secondary.
  select coalesce(array_agg(distinct m), '{}'::text[]) into v_primary
    from unnest(coalesce(p_primary_muscles, '{}'::text[])) as m;

  select coalesce(array_agg(distinct m), '{}'::text[]) into v_secondary
    from unnest(coalesce(p_secondary_muscles, '{}'::text[])) as m
    where m <> all (v_primary);

  v_all_muscles := v_primary || v_secondary;

  foreach v_muscle in array v_all_muscles
  loop
    v_base_delta := case when v_muscle = any (v_primary) then 10 else 5 end;

    select mp.level into v_old_level from muscle_progress as mp
      where mp.user_id = v_user_id and mp.muscle_group = v_muscle;
    v_old_level := coalesce(v_old_level, 0);

    insert into muscle_progress (user_id, muscle_group, score, level, last_updated)
    values (v_user_id, v_muscle, v_base_delta, muscle_level_for_score(v_base_delta), now())
    on conflict on constraint muscle_progress_user_id_muscle_group_key do update set
      score = muscle_progress.score + excluded.score,
      level = muscle_level_for_score(muscle_progress.score + excluded.score),
      last_updated = now()
    returning muscle_progress.score, muscle_progress.level into v_score_after, v_level_after;

    insert into muscle_progress_history (user_id, muscle_group, delta, score_after, level_after, reason)
    values (v_user_id, v_muscle, v_base_delta, v_score_after, v_level_after, 'exercise');

    if v_bonus > 0 then
      update muscle_progress set
        score = muscle_progress.score + v_bonus,
        level = muscle_level_for_score(muscle_progress.score + v_bonus),
        last_updated = now()
      where muscle_progress.user_id = v_user_id and muscle_progress.muscle_group = v_muscle
      returning muscle_progress.score, muscle_progress.level into v_score_after, v_level_after;

      insert into muscle_progress_history (user_id, muscle_group, delta, score_after, level_after, reason)
      values (v_user_id, v_muscle, v_bonus, v_score_after, v_level_after, 'consistency_bonus');
    end if;

    muscle_group := v_muscle;
    base_delta := v_base_delta;
    bonus_delta := v_bonus;
    total_delta := v_base_delta + v_bonus;
    new_score := v_score_after;
    new_level := v_level_after;
    leveled_up := v_level_after > v_old_level;
    return next;
  end loop;

  return;
end;
$$;

grant execute on function complete_exercise(text, text, text[], text[], uuid) to authenticated;

-- Row Level Security
alter table completed_exercises enable row level security;
alter table muscle_progress enable row level security;
alter table muscle_progress_history enable row level security;

create policy "Users manage own completed exercises" on completed_exercises for all using (auth.uid() = user_id);
create policy "Users manage own muscle progress" on muscle_progress for all using (auth.uid() = user_id);
create policy "Users manage own muscle progress history" on muscle_progress_history for all using (auth.uid() = user_id);

-- Indexes
create index idx_completed_exercises_user on completed_exercises(user_id);
create index idx_muscle_progress_user on muscle_progress(user_id);
create index idx_muscle_progress_history_user_recorded on muscle_progress_history(user_id, recorded_at);

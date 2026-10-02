-- Workout Log (docs/design/workout-log-implementation-handoff.md). One row
-- per logged set, not per workout — workout_instance_id groups the sets
-- performed in one visit to an exercise. There is no durable plan table yet
-- (the active Coach plan lives client-side in AsyncStorage), so
-- plan_thread_id/session_index/session_label are stored as plain context,
-- never foreign keys.
--
-- Additive only; apply through the project's normal Supabase migration
-- workflow — do not apply remotely until that's authorized.

create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_instance_id uuid not null,
  exercise_id text not null check (char_length(exercise_id) between 1 and 200),
  exercise_name text not null check (char_length(exercise_name) between 1 and 200),
  plan_thread_id text,
  session_index smallint,
  session_label text,
  plan_week smallint check (plan_week is null or plan_week > 0),
  set_number smallint not null check (set_number > 0),
  reps smallint check (reps is null or (reps >= 0 and reps <= 500)),
  weight_value numeric(7, 2) check (weight_value is null or weight_value >= 0),
  weight_unit text not null check (weight_unit in ('kg', 'lbs')),
  -- Canonical comparison value for PRs; must agree with weight_value (both
  -- null together, both set together). 1 lb = 0.45359237 kg exactly.
  weight_kg numeric(7, 2) check (
    (weight_value is null and weight_kg is null) or
    (weight_value is not null and weight_kg is not null)
  ),
  completed boolean not null default false,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_instance_id, set_number)
);

create or replace function public.set_workout_set_logs_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_set_logs_set_updated_at on public.workout_set_logs;
create trigger workout_set_logs_set_updated_at
before update on public.workout_set_logs
for each row execute function public.set_workout_set_logs_updated_at();

-- Loading one exercise's history for a user (screen-open: find today's
-- instance, and future reporting across days).
create index if not exists idx_workout_set_logs_user_exercise_date
  on public.workout_set_logs (user_id, exercise_id, performed_at desc);

-- Same-day instance lookup on screen open.
create index if not exists idx_workout_set_logs_instance
  on public.workout_set_logs (workout_instance_id);

-- PR computation: max weight_kg for a user/exercise.
create index if not exists idx_workout_set_logs_pr
  on public.workout_set_logs (user_id, exercise_id, weight_kg desc)
  where weight_kg is not null;

alter table public.workout_set_logs enable row level security;

revoke all on table public.workout_set_logs from anon, authenticated;
grant select, insert, update, delete on public.workout_set_logs to authenticated;

drop policy if exists workout_set_logs_select_own on public.workout_set_logs;
drop policy if exists workout_set_logs_insert_own on public.workout_set_logs;
drop policy if exists workout_set_logs_update_own on public.workout_set_logs;
drop policy if exists workout_set_logs_delete_own on public.workout_set_logs;
create policy workout_set_logs_select_own on public.workout_set_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_set_logs_insert_own on public.workout_set_logs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workout_set_logs_update_own on public.workout_set_logs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_set_logs_delete_own on public.workout_set_logs for delete to authenticated using ((select auth.uid()) = user_id);

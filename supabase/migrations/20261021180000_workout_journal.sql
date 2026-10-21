-- Workout journal: one workout occurrence shared by the guided session, the
-- per-exercise Workout Log, and optional workout-level extras (cardio and
-- water). Additive only — existing workout_set_logs rows and shipped clients
-- keep working (every new column is nullable or defaulted).
--
-- Plan definitions still live client-side (the Coach plan in AsyncStorage);
-- a workout_sessions row is an actual occurrence of a plan session (or an
-- ad-hoc workout), so plan context is stored as plain values, not foreign
-- keys — same convention as workout_set_logs.
--
-- Everything here is private to its owner. Personal records are derived from
-- workout_set_logs and never touch the shared equipment catalog.
--
-- Apply through the project's normal Supabase migration workflow; validated
-- locally in PGlite (tests/workoutJournal.db.test.ts).

-- ─── Workout occurrences ─────────────────────────────────────────────────────
-- public.workout_sessions already exists in production (created by
-- 20260922010000_coach_accounts_history on main: id, user_id, program_id,
-- plan_session_id, started_at, completed_at, status in
-- ('in_progress','completed','abandoned'), created_at — plus set_logs
-- referencing it). It is extended here, not replaced: same status values,
-- same policy names. In an environment without it, a compatible table is
-- created first (without the program/plan FKs, whose tables live on main).

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz not null default now()
);

alter table public.workout_sessions
  -- 'plan': an occurrence of a Coach plan session (the plan itself lives on
  -- the device); 'adhoc': a workout started outside a plan. Null for rows
  -- written by the server-side program design.
  add column if not exists source text,
  add column if not exists plan_thread_id text,
  add column if not exists session_index smallint,
  add column if not exists session_label text,
  add column if not exists plan_week smallint,
  -- Guided-session clock (pauses excluded); null when never timed.
  add column if not exists elapsed_seconds integer,
  add column if not exists updated_at timestamptz not null default now();

alter table public.workout_sessions alter column started_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_sessions_source_check') then
    alter table public.workout_sessions add constraint workout_sessions_source_check
      check (source is null or source in ('plan', 'adhoc'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_sessions_plan_context_check') then
    alter table public.workout_sessions add constraint workout_sessions_plan_context_check
      check (source is distinct from 'plan' or session_index is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_sessions_journal_values_check') then
    alter table public.workout_sessions add constraint workout_sessions_journal_values_check check (
      (session_index is null or session_index >= 0)
      and (plan_week is null or plan_week > 0)
      and (elapsed_seconds is null or elapsed_seconds >= 0)
      and (session_label is null or char_length(session_label) <= 300)
    );
  end if;
end;
$$;

create index if not exists idx_workout_sessions_user_plan
  on public.workout_sessions (user_id, plan_thread_id, session_index, started_at desc);

-- ─── Set logs: link to the occurrence, set kind, entry source ───────────────

alter table public.workout_set_logs
  add column if not exists workout_session_id uuid references public.workout_sessions(id) on delete set null,
  -- Warm-ups never establish working-set records.
  add column if not exists set_kind text not null default 'working',
  -- How the row was entered: guided session, table edit, or copied from a
  -- previous workout (still needs explicit confirmation to count).
  add column if not exists entry_source text,
  -- Optional link to the app's equipment page the workout came from
  -- (public.equipment — not the research catalog, not a physical machine).
  add column if not exists equipment_id uuid references public.equipment(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_set_logs_set_kind_check') then
    alter table public.workout_set_logs
      add constraint workout_set_logs_set_kind_check check (set_kind in ('working', 'warmup'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_set_logs_entry_source_check') then
    alter table public.workout_set_logs
      add constraint workout_set_logs_entry_source_check
      check (entry_source is null or entry_source in ('guided', 'table', 'copied_previous'));
  end if;
end;
$$;

create index if not exists idx_workout_set_logs_session
  on public.workout_set_logs (workout_session_id) where workout_session_id is not null;

-- Records per set number: completed working sets with a weight.
create index if not exists idx_workout_set_logs_set_records
  on public.workout_set_logs (user_id, exercise_id, set_number)
  where completed and weight_kg is not null;

-- ─── Quick completion ────────────────────────────────────────────────────────
-- "Done" without set details. Records completion only: no reps, weight,
-- volume or records. Details added later attach to the same exercise.

create table if not exists public.workout_exercise_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id text not null check (char_length(exercise_id) between 1 and 200),
  exercise_name text not null check (char_length(exercise_name) between 1 and 200),
  completion_kind text not null default 'quick' check (completion_kind in ('quick')),
  completed_at timestamptz not null default now(),
  unique (workout_session_id, exercise_id)
);

-- ─── Optional workout extras ─────────────────────────────────────────────────
-- Workout-level, not per exercise. Only what the person supplied: missing
-- duration stays null, never 0.

create table if not exists public.workout_cardio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  activity text not null check (activity in ('walking', 'cycling', 'running', 'elliptical', 'rowing', 'stairs', 'other')),
  activity_label text check (activity_label is null or char_length(activity_label) between 1 and 80),
  duration_minutes numeric(5, 1) check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 600)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_cardio_session on public.workout_cardio_entries (workout_session_id);

-- One row per quick-add, so an accidental tap can be removed on its own.
-- amount_ml is the normalized value; entered_amount/entered_unit keep what
-- the person tapped (8 fl oz, 250 ml) for display and auditing.
create table if not exists public.workout_hydration_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  amount_ml numeric(7, 2) not null check (amount_ml > 0 and amount_ml <= 5000),
  entered_amount numeric(7, 2) not null check (entered_amount > 0),
  entered_unit text not null check (entered_unit in ('fl_oz', 'ml')),
  created_at timestamptz not null default now()
);

create index if not exists idx_workout_hydration_session on public.workout_hydration_entries (workout_session_id);

-- ─── updated_at ──────────────────────────────────────────────────────────────

create or replace function public.set_workout_journal_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row execute function public.set_workout_journal_updated_at();

drop trigger if exists workout_cardio_set_updated_at on public.workout_cardio_entries;
create trigger workout_cardio_set_updated_at
before update on public.workout_cardio_entries
for each row execute function public.set_workout_journal_updated_at();

-- ─── Row level security: owner only ──────────────────────────────────────────
-- Child rows must also point at a session the same user owns, so nobody can
-- attach entries to (or probe) someone else's workout.

alter table public.workout_sessions enable row level security;
alter table public.workout_exercise_completions enable row level security;
alter table public.workout_cardio_entries enable row level security;
alter table public.workout_hydration_entries enable row level security;

revoke all on table public.workout_sessions from anon, authenticated;
revoke all on table public.workout_exercise_completions from anon, authenticated;
revoke all on table public.workout_cardio_entries from anon, authenticated;
revoke all on table public.workout_hydration_entries from anon, authenticated;

grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_exercise_completions to authenticated;
grant select, insert, update, delete on public.workout_cardio_entries to authenticated;
grant select, insert, update, delete on public.workout_hydration_entries to authenticated;

-- Same names and meaning as the existing production policies (recreated so
-- a fresh environment gets them too).
drop policy if exists workout_sessions_own on public.workout_sessions;
drop policy if exists workout_sessions_select_own on public.workout_sessions;
drop policy if exists workout_sessions_insert_own on public.workout_sessions;
drop policy if exists workout_sessions_update_own on public.workout_sessions;
drop policy if exists workout_sessions_delete_own on public.workout_sessions;
create policy workout_sessions_select_own on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_sessions_insert_own on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workout_sessions_update_own on public.workout_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_sessions_delete_own on public.workout_sessions for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists workout_exercise_completions_own on public.workout_exercise_completions;
create policy workout_exercise_completions_own on public.workout_exercise_completions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid()))
  );

drop policy if exists workout_cardio_entries_own on public.workout_cardio_entries;
create policy workout_cardio_entries_own on public.workout_cardio_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid()))
  );

drop policy if exists workout_hydration_entries_own on public.workout_hydration_entries;
create policy workout_hydration_entries_own on public.workout_hydration_entries for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid()))
  );

-- Set logs already restrict rows to their owner; additionally, a set may
-- only reference its owner's workout session.
drop policy if exists workout_set_logs_insert_own on public.workout_set_logs;
create policy workout_set_logs_insert_own on public.workout_set_logs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (workout_session_id is null or exists (
      select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid())
    ))
  );
drop policy if exists workout_set_logs_update_own on public.workout_set_logs;
create policy workout_set_logs_update_own on public.workout_set_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (workout_session_id is null or exists (
      select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid())
    ))
  );

comment on table public.workout_sessions is 'Actual workout occurrences (plan session or ad hoc). Private to the owner.';
comment on table public.workout_exercise_completions is 'Exercise marked done without set details. Never a source of performed sets or records.';
comment on table public.workout_hydration_entries is 'Water logged during a workout. Not a daily total and not an intake recommendation.';

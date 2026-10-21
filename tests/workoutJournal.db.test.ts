// Workout journal migration + row level security, validated locally in
// PGlite (real Postgres in-process) — no remote database is touched.
// Applies the real migration files on top of a minimal Supabase-like base
// (roles, auth.uid(), profiles, equipment). Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
const SET_LOGS = readFileSync(join(MIGRATIONS, "20261001010000_add_workout_set_logs.sql"), "utf8");
const JOURNAL = readFileSync(join(MIGRATIONS, "20261021180000_workout_journal.sql"), "utf8");

const A = "00000000-0000-0000-0000-0000000000aa";
const B = "00000000-0000-0000-0000-0000000000bb";

const BASE = `
  create role authenticated nologin;
  create role anon nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant usage on schema public to authenticated, anon;
  create table public.profiles (id uuid primary key);
  create table public.equipment (id uuid primary key default gen_random_uuid(), name text);
  insert into public.profiles values ('${A}'), ('${B}');
`;

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(SET_LOGS);
  await db.exec(JOURNAL);
  return db;
}

async function as(db: PGlite, who: "anon" | string) {
  await db.exec("reset role;");
  if (who === "anon") {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  } else {
    await db.exec(`select set_config('request.jwt.claim.sub', '${who}', false); set role authenticated;`);
  }
}

async function asAdmin(db: PGlite) {
  await db.exec("reset role;");
}

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (error: any) => pattern.test(String(error?.message ?? error)));
}

test("migration applies on top of existing set logs, twice, and keeps old rows valid", async () => {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(SET_LOGS);
  // A row written by a shipped client before the migration.
  await db.exec(`insert into public.workout_set_logs (user_id, workout_instance_id, exercise_id, exercise_name, set_number, reps, weight_value, weight_unit, weight_kg, completed)
                 values ('${A}', gen_random_uuid(), 'barbell_bench', 'Bench', 1, 6, 40, 'lbs', 18.14, true);`);
  await db.exec(JOURNAL);
  await db.exec(JOURNAL); // idempotent
  const old = await db.query<{ set_kind: string; workout_session_id: string | null; entry_source: string | null }>(
    "select set_kind, workout_session_id, entry_source from public.workout_set_logs"
  );
  assert.deepEqual(old.rows, [{ set_kind: "working", workout_session_id: null, entry_source: null }]);
});

// Production already has main's workout_sessions (20260922010000
// coach_accounts_history) with programs/plan_sessions FKs, set_logs
// referencing it, and per-command policies. The journal must extend it.
const MAIN_WORKOUT_SESSIONS = `
  create table public.programs (id uuid primary key default gen_random_uuid());
  create table public.plan_sessions (id uuid primary key default gen_random_uuid());
  create table public.workout_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    program_id uuid references public.programs(id) on delete set null,
    plan_session_id uuid references public.plan_sessions(id) on delete set null,
    started_at timestamptz,
    completed_at timestamptz,
    status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
    created_at timestamptz not null default now()
  );
  create table public.set_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
    exercise_id text not null,
    set_number smallint not null
  );
  alter table public.workout_sessions enable row level security;
  grant select, insert, update, delete on public.workout_sessions to authenticated;
  create policy workout_sessions_select_own on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
  create policy workout_sessions_insert_own on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
  create policy workout_sessions_update_own on public.workout_sessions for update to authenticated using ((select auth.uid()) = user_id);
  create policy workout_sessions_delete_own on public.workout_sessions for delete to authenticated using ((select auth.uid()) = user_id);
  insert into public.workout_sessions (user_id, status) values ('${A}', 'completed');
`;

test("extends production's existing workout_sessions instead of replacing it", async () => {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(MAIN_WORKOUT_SESSIONS);
  await db.exec(SET_LOGS);
  await db.exec(JOURNAL);
  await db.exec(JOURNAL);
  // Main's columns and row survive; the journal's columns are added.
  const cols = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'workout_sessions'"
  );
  const names = cols.rows.map((row) => row.column_name);
  for (const column of ["program_id", "plan_session_id", "status", "source", "session_index", "elapsed_seconds", "updated_at"]) {
    assert.ok(names.includes(column), `missing ${column}`);
  }
  const policies = await db.query<{ policyname: string }>("select policyname from pg_policies where tablename = 'workout_sessions' order by 1");
  assert.deepEqual(policies.rows.map((row) => row.policyname), [
    "workout_sessions_delete_own",
    "workout_sessions_insert_own",
    "workout_sessions_select_own",
    "workout_sessions_update_own",
  ]);
  await as(db, A);
  const legacy = await db.query<{ status: string; source: string | null }>("select status, source from public.workout_sessions");
  assert.deepEqual(legacy.rows, [{ status: "completed", source: null }]);
  const created = await db.query<{ status: string }>(
    `insert into public.workout_sessions (user_id, source, plan_thread_id, session_index) values ('${A}', 'plan', 't', 0) returning status`
  );
  assert.equal(created.rows[0].status, "in_progress");
  await as(db, B);
  assert.equal((await db.query("select * from public.workout_sessions")).rows.length, 0);
});

test("owners see only their own workouts, sets and extras", async () => {
  const db = await freshDb();
  await as(db, A);
  const session = (await db.query<{ id: string }>(
    `insert into public.workout_sessions (user_id, source, plan_thread_id, session_index) values ('${A}', 'plan', 't1', 8) returning id`
  )).rows[0].id;
  await db.exec(`
    insert into public.workout_cardio_entries (user_id, workout_session_id, activity, duration_minutes) values ('${A}', '${session}', 'walking', 10);
    insert into public.workout_hydration_entries (user_id, workout_session_id, amount_ml, entered_amount, entered_unit) values ('${A}', '${session}', 236.59, 8, 'fl_oz');
    insert into public.workout_exercise_completions (user_id, workout_session_id, exercise_id, exercise_name) values ('${A}', '${session}', 'goblet_squat', 'Goblet squat');
    insert into public.workout_set_logs (user_id, workout_instance_id, workout_session_id, exercise_id, exercise_name, set_number, reps, weight_value, weight_unit, weight_kg, completed, entry_source)
      values ('${A}', gen_random_uuid(), '${session}', 'barbell_bench', 'Bench', 1, 6, 40, 'lbs', 18.14, true, 'guided');
  `);

  await as(db, B);
  for (const table of ["workout_sessions", "workout_cardio_entries", "workout_hydration_entries", "workout_exercise_completions", "workout_set_logs"]) {
    const visible = await db.query(`select * from public.${table}`);
    assert.equal(visible.rows.length, 0, `${table} leaked to another user`);
  }
  // B can't change or delete A's rows either (RLS hides them: 0 rows affected).
  const updated = await db.query(`update public.workout_cardio_entries set duration_minutes = 99 returning id`);
  assert.equal(updated.rows.length, 0);
  const deleted = await db.query(`delete from public.workout_hydration_entries returning id`);
  assert.equal(deleted.rows.length, 0);

  await as(db, A);
  assert.equal((await db.query("select * from public.workout_hydration_entries")).rows.length, 1);
});

test("nobody can attach entries to someone else's workout", async () => {
  const db = await freshDb();
  await as(db, A);
  const session = (await db.query<{ id: string }>(
    `insert into public.workout_sessions (user_id, source) values ('${A}', 'adhoc') returning id`
  )).rows[0].id;
  await as(db, B);
  await rejects(
    db.exec(`insert into public.workout_cardio_entries (user_id, workout_session_id, activity) values ('${B}', '${session}', 'running')`),
    /row-level security/
  );
  await rejects(
    db.exec(`insert into public.workout_hydration_entries (user_id, workout_session_id, amount_ml, entered_amount, entered_unit) values ('${B}', '${session}', 250, 250, 'ml')`),
    /row-level security/
  );
  await rejects(
    db.exec(`insert into public.workout_set_logs (user_id, workout_instance_id, workout_session_id, exercise_id, exercise_name, set_number, weight_unit) values ('${B}', gen_random_uuid(), '${session}', 'x', 'X', 1, 'lbs')`),
    /row-level security/
  );
  // Nor write rows owned by someone else.
  await rejects(
    db.exec(`insert into public.workout_sessions (user_id, source) values ('${A}', 'adhoc')`),
    /row-level security/
  );
});

test("signed-out (anon) clients can't read or write anything", async () => {
  const db = await freshDb();
  await as(db, "anon");
  for (const table of ["workout_sessions", "workout_cardio_entries", "workout_hydration_entries", "workout_exercise_completions", "workout_set_logs"]) {
    await rejects(db.query(`select * from public.${table}`), /permission denied/);
  }
  await rejects(db.exec(`insert into public.workout_sessions (user_id, source) values ('${A}', 'adhoc')`), /permission denied/);
});

test("re-saving a set updates the same row (no duplicates)", async () => {
  const db = await freshDb();
  await as(db, A);
  const upsert = (reps: number) =>
    db.exec(`insert into public.workout_set_logs (user_id, workout_instance_id, exercise_id, exercise_name, set_number, reps, weight_unit, completed)
             values ('${A}', '11111111-1111-1111-1111-111111111111', 'bench', 'Bench', 2, ${reps}, 'lbs', true)
             on conflict (workout_instance_id, set_number) do update set reps = excluded.reps`);
  await upsert(6);
  await upsert(6);
  await upsert(8);
  const rows = await db.query<{ reps: number }>("select reps from public.workout_set_logs");
  assert.deepEqual(rows.rows, [{ reps: 8 }]);
});

test("quick completion is one row per exercise per workout and has no set data", async () => {
  const db = await freshDb();
  await as(db, A);
  const session = (await db.query<{ id: string }>(`insert into public.workout_sessions (user_id, source) values ('${A}', 'adhoc') returning id`)).rows[0].id;
  const insert = () =>
    db.exec(`insert into public.workout_exercise_completions (user_id, workout_session_id, exercise_id, exercise_name) values ('${A}', '${session}', 'squat', 'Squat') on conflict (workout_session_id, exercise_id) do nothing`);
  await insert();
  await insert();
  assert.equal((await db.query("select * from public.workout_exercise_completions")).rows.length, 1);
  assert.equal((await db.query("select * from public.workout_set_logs")).rows.length, 0);
});

test("constraints: missing stays null, bad values are refused, plan workouts need a session index", async () => {
  const db = await freshDb();
  await as(db, A);
  const session = (await db.query<{ id: string }>(`insert into public.workout_sessions (user_id, source) values ('${A}', 'adhoc') returning id`)).rows[0].id;
  await db.exec(`insert into public.workout_cardio_entries (user_id, workout_session_id, activity) values ('${A}', '${session}', 'cycling')`);
  const cardio = await db.query<{ duration_minutes: string | null }>("select duration_minutes from public.workout_cardio_entries");
  assert.equal(cardio.rows[0].duration_minutes, null);
  await rejects(db.exec(`insert into public.workout_cardio_entries (user_id, workout_session_id, activity, duration_minutes) values ('${A}', '${session}', 'cycling', 0)`), /check constraint/);
  await rejects(db.exec(`insert into public.workout_cardio_entries (user_id, workout_session_id, activity) values ('${A}', '${session}', 'swimming')`), /check constraint/);
  await rejects(db.exec(`insert into public.workout_hydration_entries (user_id, workout_session_id, amount_ml, entered_amount, entered_unit) values ('${A}', '${session}', 0, 0, 'ml')`), /check constraint/);
  await rejects(db.exec(`insert into public.workout_sessions (user_id, source) values ('${A}', 'plan')`), /check constraint/);
  await rejects(db.exec(`insert into public.workout_set_logs (user_id, workout_instance_id, exercise_id, exercise_name, set_number, weight_unit, set_kind) values ('${A}', gen_random_uuid(), 'x', 'X', 1, 'lbs', 'dropset')`), /check constraint/);
});

test("deleting a workout removes its extras and unlinks (keeps) its sets", async () => {
  const db = await freshDb();
  await as(db, A);
  const session = (await db.query<{ id: string }>(`insert into public.workout_sessions (user_id, source) values ('${A}', 'adhoc') returning id`)).rows[0].id;
  await db.exec(`
    insert into public.workout_hydration_entries (user_id, workout_session_id, amount_ml, entered_amount, entered_unit) values ('${A}', '${session}', 250, 250, 'ml');
    insert into public.workout_set_logs (user_id, workout_instance_id, workout_session_id, exercise_id, exercise_name, set_number, weight_unit, completed) values ('${A}', gen_random_uuid(), '${session}', 'x', 'X', 1, 'lbs', true);
    delete from public.workout_sessions where id = '${session}';
  `);
  assert.equal((await db.query("select * from public.workout_hydration_entries")).rows.length, 0);
  const sets = await db.query<{ workout_session_id: string | null }>("select workout_session_id from public.workout_set_logs");
  assert.deepEqual(sets.rows, [{ workout_session_id: null }]);
  await asAdmin(db);
});

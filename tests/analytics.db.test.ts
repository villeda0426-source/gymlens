// Product analytics migration, validated locally in PGlite (real Postgres
// in-process) — no remote database is touched. Applies the real migration
// files on top of a minimal Supabase-like base. Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");
const SET_LOGS = readFileSync(join(MIGRATIONS, "20261001010000_add_workout_set_logs.sql"), "utf8");
const JOURNAL = readFileSync(join(MIGRATIONS, "20261021180000_workout_journal.sql"), "utf8");
const ANALYTICS = readFileSync(join(MIGRATIONS, "20261026120000_product_analytics.sql"), "utf8");

const A = "00000000-0000-0000-0000-0000000000aa";
const B = "00000000-0000-0000-0000-0000000000bb";
const INSTALL = "11111111-1111-4111-8111-111111111111";
const SEGMENT = "22222222-2222-4222-8222-222222222222";

const BASE = `
  create role authenticated nologin;
  create role anon nologin;
  create role service_role nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table auth.users (id uuid primary key, raw_app_meta_data jsonb);
  grant usage on schema auth to authenticated, anon;
  grant usage on schema public to authenticated, anon, service_role;
  create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    goal text, days_per_week int, session_minutes int, equipment_type text,
    experience_level text default 'beginner', safety_reviewed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create table public.equipment (id uuid primary key default gen_random_uuid(), name text);
  create table public.ai_usage_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles (id) on delete set null,
    feature text, model text, input_tokens int, output_tokens int, latency_ms int, succeeded boolean,
    created_at timestamptz not null default now()
  );
  create table public.app_installations (
    id uuid primary key default gen_random_uuid(),
    installation_id text unique not null,
    user_id uuid references public.profiles (id) on delete cascade,
    platform text, app_version text, build_number int, locale text,
    created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
  );
  alter table public.ai_usage_events enable row level security;
  alter table public.app_installations enable row level security;
  grant select, insert, update, delete on all tables in schema public to authenticated, anon;
  insert into auth.users values ('${A}', '{"provider":"apple"}'), ('${B}', '{"provider":"email"}');
`;

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(SET_LOGS);
  await db.exec(JOURNAL);
  await db.exec(ANALYTICS);
  return db;
}

async function events(db: PGlite, name: string) {
  return (await db.query<any>(`select * from public.analytics_events where event_name = $1 order by occurred_at`, [name])).rows;
}

async function as(db: PGlite, role: "anon" | "authenticated", sub = "") {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role};`);
}

test("migration applies twice and keeps existing AI usage rows", async () => {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(SET_LOGS);
  await db.exec(JOURNAL);
  await db.exec(`insert into public.ai_usage_events (feature, model, input_tokens, output_tokens, latency_ms, succeeded)
                 values ('coach_trainer', 'gpt-5-mini', 10, 20, 300, true)`);
  await db.exec(ANALYTICS);
  await db.exec(ANALYTICS);
  const rows = (await db.query<any>(`select feature, actor, cost_usd from public.ai_usage_events`)).rows;
  assert.deepEqual(rows, [{ feature: "coach_trainer", actor: null, cost_usd: null }]);
  // Old-shape inserts (the currently deployed server) still work.
  await db.exec(`insert into public.ai_usage_events (feature, model, input_tokens, output_tokens, latency_ms, succeeded)
                 values ('workout_search', 'gpt-5-mini', 1, 1, 1, true)`);
  await assert.rejects(db.exec(`insert into public.ai_usage_events (feature, actor) values ('x', 'someone')`));
});

test("signup_completed is recorded once per new profile, with the auth method", async () => {
  const db = await freshDb();
  await db.exec(`insert into public.profiles (id) values ('${A}'), ('${B}')`);
  const rows = await events(db, "signup_completed");
  assert.equal(rows.length, 2);
  const byUser = Object.fromEntries(rows.map((row) => [row.user_id, row]));
  assert.deepEqual(byUser[A].properties, { method: "apple" });
  assert.deepEqual(byUser[B].properties, { method: "email" });
  assert.equal(byUser[A].source, "database");
  // Re-recording the same fact can't duplicate it.
  await db.exec(`select public.analytics_record_db_event('${A}', 'signup_completed', '${A}', '{}', now())`);
  assert.equal((await events(db, "signup_completed")).length, 2);
});

test("coach_survey_completed fires only when the survey save sets safety_reviewed_at", async () => {
  const db = await freshDb();
  await db.exec(`insert into public.profiles (id) values ('${A}')`);
  await db.exec(`update public.profiles set goal = 'strength' where id = '${A}'`);
  assert.equal((await events(db, "coach_survey_completed")).length, 0);

  await db.exec(`update public.profiles set goal = 'fat_loss', days_per_week = 3, session_minutes = 45,
                   equipment_type = 'full_gym', safety_reviewed_at = '2026-10-26T10:00:00Z' where id = '${A}'`);
  await db.exec(`update public.profiles set days_per_week = 4 where id = '${A}'`);
  const rows = await events(db, "coach_survey_completed");
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].properties, {
    goal: "fat_loss", days_per_week: 3, session_minutes: 45, equipment_type: "full_gym", experience_level: "beginner",
  });

  // A later rebuild is a new completion.
  await db.exec(`update public.profiles set safety_reviewed_at = '2026-11-02T10:00:00Z' where id = '${A}'`);
  assert.equal((await events(db, "coach_survey_completed")).length, 2);
});

test("workout_started is recorded once per workout session", async () => {
  const db = await freshDb();
  await db.exec(`insert into public.profiles (id) values ('${A}')`);
  await db.exec(`insert into public.workout_sessions (user_id, source, session_index, plan_week, started_at)
                 values ('${A}', 'plan', 2, 1, now()), ('${A}', 'adhoc', null, null, now())`);
  const rows = await events(db, "workout_started");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.properties).sort((x: any, y: any) => x.kind.localeCompare(y.kind)), [
    { kind: "adhoc" },
    { kind: "plan", plan_week: 1, session_index: 2 },
  ]);
  await db.exec(`update public.workout_sessions set status = 'completed'`);
  assert.equal((await events(db, "workout_started")).length, 2);
});

test("an analytics failure never blocks the workout, signup or survey write", async () => {
  const db = await freshDb();
  await db.exec(`alter table public.analytics_events add constraint always_fails check (false) not valid`);
  await db.exec(`insert into public.profiles (id) values ('${A}')`);
  await db.exec(`update public.profiles set safety_reviewed_at = now() where id = '${A}'`);
  await db.exec(`insert into public.workout_sessions (user_id, source, started_at) values ('${A}', 'adhoc', now())`);
  assert.equal((await db.query<any>(`select count(*)::int n from public.workout_sessions`)).rows[0].n, 1);
  assert.equal((await db.query<any>(`select count(*)::int n from public.analytics_events`)).rows[0].n, 0);
});

test("the app's public roles can't read, write or purge analytics", async () => {
  const db = await freshDb();
  await db.exec(`insert into public.profiles (id) values ('${A}')`);
  for (const role of ["anon", "authenticated"] as const) {
    await as(db, role, role === "authenticated" ? A : "");
    for (const table of ["analytics_events", "installation_identities"]) {
      await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
    }
    await assert.rejects(
      db.query(`insert into public.analytics_events (event_id, event_name, occurred_at, source)
                values (gen_random_uuid(), 'signup_completed', now(), 'client')`),
      /permission denied/
    );
    await assert.rejects(db.query(`select public.purge_expired_analytics()`), /permission denied/);
    await assert.rejects(db.query(`select * from analytics.events_resolved`), /permission denied/);
  }
  await db.exec("reset role;");
});

test("retention purges only events older than 13 months", async () => {
  const db = await freshDb();
  await db.exec(`insert into public.analytics_events (event_id, event_name, occurred_at, source) values
    (gen_random_uuid(), 'screen_view', now() - interval '14 months', 'client'),
    (gen_random_uuid(), 'screen_view', now() - interval '12 months', 'client'),
    (gen_random_uuid(), 'screen_view', now(), 'client')`);
  const deleted = (await db.query<any>(`select public.purge_expired_analytics() as n`)).rows[0].n;
  assert.equal(deleted, 1);
  assert.equal((await db.query<any>(`select count(*)::int n from public.analytics_events`)).rows[0].n, 2);
});

test("pre-signup events resolve to the account that owns their segment; deletion cascades", async () => {
  const db = await freshDb();
  await db.exec(`insert into public.profiles (id) values ('${A}')`);
  await db.exec(`insert into public.analytics_events (event_id, event_name, occurred_at, source, installation_id, segment_id)
                 values (gen_random_uuid(), 'app_first_open', now(), 'client', '${INSTALL}', '${SEGMENT}')`);
  assert.equal((await db.query<any>(`select user_id from analytics.events_resolved where event_name = 'app_first_open'`)).rows[0].user_id, null);
  await db.exec(`insert into public.installation_identities (segment_id, installation_id, user_id) values ('${SEGMENT}', '${INSTALL}', '${A}')`);
  assert.equal((await db.query<any>(`select user_id from analytics.events_resolved where event_name = 'app_first_open'`)).rows[0].user_id, A);

  await db.exec(`delete from auth.users where id = '${A}'`);
  assert.equal((await db.query<any>(`select count(*)::int n from public.installation_identities`)).rows[0].n, 0);
  assert.equal((await db.query<any>(`select count(*)::int n from public.analytics_events where user_id is not null`)).rows[0].n, 0);
});

const QUERIES = readFileSync(join(__dirname, "..", "docs", "analytics", "queries.sql"), "utf8")
  .split(/^-- name: /m)
  .slice(1)
  .map((block) => ({ name: block.split("\n")[0].trim(), sql: block.slice(block.indexOf("\n") + 1) }));

test("a full journey shows up in every funnel step and every saved query runs", async () => {
  const db = await freshDb();
  const t0 = Date.now() - 20 * 86400000; // window closed
  const at = (minutes: number) => new Date(t0 + minutes * 60000).toISOString();
  const client = (id: string, name: string, minutes: number, userId: string | null, props = "{}") =>
    `insert into public.analytics_events (event_id, event_name, occurred_at, source, installation_id, segment_id, session_id, user_id, platform, app_version, build_number, properties)
     values ('${id}', '${name}', '${at(minutes)}', 'client', '${INSTALL}', '${SEGMENT}', '${SEGMENT}', ${userId ? `'${userId}'` : "null"}, 'ios', '1.0.8', 50, '${props}')`;

  await db.exec(client("a0000000-0000-4000-8000-000000000001", "app_first_open", 0, null));
  await db.exec(client("a0000000-0000-4000-8000-000000000002", "screen_view", 0, null, '{"screen":"(auth)/login"}'));
  await db.exec(client("a0000000-0000-4000-8000-000000000003", "signup_started", 2, null, '{"method":"apple"}'));
  // Server clock 1 minute "behind" the device: still counted.
  await db.exec(`insert into public.profiles (id, created_at) values ('${A}', '${at(1)}')`);
  await db.exec(`insert into public.installation_identities (segment_id, installation_id, user_id) values ('${SEGMENT}', '${INSTALL}', '${A}')`);
  await db.exec(client("a0000000-0000-4000-8000-000000000004", "coach_survey_started", 5, A, '{"entry":"new"}'));
  await db.exec(`update public.profiles set safety_reviewed_at = '${at(8)}' where id = '${A}'`);
  await db.exec(client("a0000000-0000-4000-8000-000000000005", "plan_generated", 9, A, '{"origin":"setup"}'));
  await db.exec(`insert into public.workout_sessions (user_id, source, session_index, plan_week, started_at) values ('${A}', 'plan', 0, 1, '${at(30)}')`);
  await db.exec(client("a0000000-0000-4000-8000-000000000006", "workout_completed", 75, A, '{"kind":"plan"}'));
  await db.exec(client("a0000000-0000-4000-8000-000000000007", "screen_view", 76, A, '{"screen":"(tabs)/plan"}'));
  await db.exec(`insert into public.ai_usage_events (user_id, feature, model, input_tokens, output_tokens, latency_ms, succeeded, actor, cost_usd, created_at)
                 values ('${A}', 'coach_intake', 'gpt-5-mini', 100, 50, 900, true, 'user', 0.000125, now())`);

  const row = (await db.query<any>(`select * from analytics.funnel_installations`)).rows[0];
  for (const step of ["signup_started_at", "signup_completed_at", "survey_started_at", "survey_completed_at", "plan_generated_at", "workout_started_at", "workout_completed_at"]) {
    assert.ok(row[step], `${step} reached`);
  }

  const results: Record<string, any[]> = {};
  for (const query of QUERIES) results[query.name] = (await db.query<any>(query.sql)).rows;
  assert.deepEqual(Object.keys(results).sort(), [
    "ai_cost_by_feature_30d", "ai_cost_by_user_30d", "funnel_by_weekly_cohort", "funnel_step_dropoff",
    "installations_by_version", "last_screen_before_inactivity", "top_screens_30d", "users_by_version_from_requests",
  ]);
  assert.equal(results.funnel_by_weekly_cohort[0].workout_completed, 1);
  assert.deepEqual(results.funnel_step_dropoff.map((r) => Number(r.installations)), [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(results.last_screen_before_inactivity[0].screen, "(tabs)/plan");
  assert.equal(Number(results.last_screen_before_inactivity[0].inactive_7d), 1);
  assert.equal(results.ai_cost_by_feature_30d[0].feature, "coach_intake");
});

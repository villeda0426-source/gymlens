// Per-user scan history migration, validated locally in PGlite (real
// Postgres in-process) — no remote database is touched. The base table
// mirrors production's equipment_identifications as of 2026-10-21, including
// the old UNIQUE (equipment_id) that blocked every per-user row.
// Run: npm run test:app
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(
  join(__dirname, "..", "supabase", "migrations", "20261021200000_equipment_identifications_per_user.sql"),
  "utf8"
);

const A = "00000000-0000-0000-0000-0000000000aa";
const B = "00000000-0000-0000-0000-0000000000bb";
const EQ = "00000000-0000-0000-0000-0000000000e1";

const PRODUCTION_SHAPE = `
  create table public.profiles (id uuid primary key);
  create table public.equipment (id uuid primary key default gen_random_uuid(), name text not null);
  create table public.equipment_identifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.profiles(id) on delete cascade,
    equipment_id uuid unique references public.equipment(id),
    equipment_name text,
    scan_count integer not null default 1,
    last_scanned_at timestamptz default now()
  );
  insert into public.profiles values ('${A}'), ('${B}');
  insert into public.equipment (id, name) values ('${EQ}', 'Leg Press');
  insert into public.equipment_identifications (equipment_id, equipment_name) values ('${EQ}', 'Leg Press');
`;

const userRow = (userId: string) =>
  `insert into public.equipment_identifications (equipment_id, equipment_name, user_id) values ('${EQ}', 'Leg Press', '${userId}')`;

test("before the migration, the global row blocks every per-user scan (the production bug)", async () => {
  const db = new PGlite();
  await db.exec(PRODUCTION_SHAPE);
  await assert.rejects(db.exec(userRow(A)), /duplicate key|unique/i);
});

test("after it, each user gets one history row per machine, alongside the global row", async () => {
  const db = new PGlite();
  await db.exec(PRODUCTION_SHAPE);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent

  await db.exec(userRow(A));
  await db.exec(userRow(B));
  // Still one row per user per machine, and one global row per machine.
  await assert.rejects(db.exec(userRow(A)), /duplicate key|unique/i);
  await assert.rejects(
    db.exec(`insert into public.equipment_identifications (equipment_id, equipment_name) values ('${EQ}', 'Leg Press')`),
    /duplicate key|unique/i
  );

  const rows = await db.query<{ user_id: string | null }>(
    "select user_id from public.equipment_identifications order by user_id nulls first"
  );
  assert.deepEqual(rows.rows.map((row) => row.user_id), [null, A, B]);
});

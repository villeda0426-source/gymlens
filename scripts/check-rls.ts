// Static-by-default verification for the Coach account/history migration.
// Dynamic RLS proof is intentionally permitted only against an explicitly
// local Supabase stack; it never creates test users in a hosted project.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const migrationPath = "supabase/migrations/20260922010000_coach_accounts_history.sql";
const sql = fs.readFileSync(migrationPath, "utf8");
const tables = ["user_consents", "user_limitations", "exercises", "programs", "plan_sessions", "plan_exercises", "workout_sessions", "set_logs", "coach_events", "user_insights"];

for (const table of tables) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), `${table}: missing table`);
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), `${table}: RLS not enabled`);
}
for (const table of ["user_consents", "user_limitations", "exercises", "coach_events", "user_insights"]) {
  assert.match(sql, new RegExp(`${table}_select_`, "i"), `${table}: select policy missing`);
}
assert.match(sql, /array\['programs', 'plan_sessions', 'plan_exercises', 'workout_sessions', 'set_logs'\]/i, "owner-policy table list missing");
assert.match(sql, /table_name \|\| '_select_own'/i, "generated select policy missing");
for (const operation of ["insert", "update", "delete"]) {
  assert.match(sql, new RegExp(`table_name \\|\\| '_${operation}_own'`, "i"), `generated ${operation} policy missing`);
}
assert.match(sql, /handle_new_user[\s\S]*security definer[\s\S]*search_path = ''/i, "signup trigger must have an empty search path");
assert.match(sql, /on delete cascade/i, "cascade delete policy missing");
assert.doesNotMatch(sql, /insert\s+into\s+public\.coach_events[\s\S]{0,300}(?:message|prompt|user_note)/i, "coach events must not store message text");
console.log("PASS static Coach RLS migration checks");

const url = process.env.SPOTLIFT_RLS_TEST_URL;
const serviceKey = process.env.SPOTLIFT_RLS_SERVICE_ROLE_KEY;
const anonKey = process.env.SPOTLIFT_RLS_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.log("SKIP dynamic RLS proof: set SPOTLIFT_RLS_TEST_URL, SPOTLIFT_RLS_SERVICE_ROLE_KEY, and SPOTLIFT_RLS_ANON_KEY for a local Supabase stack.");
  process.exit(0);
}

const host = new URL(url as string).hostname;
assert.ok(["localhost", "127.0.0.1", "::1"].includes(host), "Dynamic RLS tests reject non-local Supabase URLs.");
const localUrl = url as string;
const localServiceKey = serviceKey as string;
const localAnonKey = anonKey as string;

async function runLocalProof() {
  const admin = createClient(localUrl, localServiceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = `Rls-${suffix}-only`;
  const create = async (label: string) => {
    const result = await admin.auth.admin.createUser({ email: `coach-rls-${label}-${suffix}@example.test`, password, email_confirm: true });
    if (result.error || !result.data.user) throw result.error ?? new Error("Local test user creation failed.");
    return result.data.user.id;
  };
  const [aId, bId] = await Promise.all([create("a"), create("b")]);
  try {
    // Proves the auth trigger created profiles, then validates that authenticated
    // user A cannot read user B's profile. The remaining per-table policies are
    // statically checked above because local projects vary in seeded FK data.
    const profileA = await admin.from("profiles").select("id").eq("id", aId).maybeSingle();
    const profileB = await admin.from("profiles").select("id").eq("id", bId).maybeSingle();
    assert.ok(profileA.data && profileB.data, "signup trigger did not create both profiles");

    const clientA = createClient(localUrl, localAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const login = await clientA.auth.signInWithPassword({ email: `coach-rls-a-${suffix}@example.test`, password });
    if (login.error) throw login.error;
    const foreignRead = await clientA.from("profiles").select("id").eq("id", bId);
    assert.equal((foreignRead.data ?? []).length, 0, "user A read user B's profile");

    const deleted = await admin.auth.admin.deleteUser(aId);
    if (deleted.error) throw deleted.error;
    const cascade = await admin.from("profiles").select("id").eq("id", aId).maybeSingle();
    assert.equal(cascade.data, null, "profile did not cascade after auth user deletion");
    console.log("PASS local trigger, ownership read isolation, and cascade proof");
  } finally {
    await Promise.allSettled([admin.auth.admin.deleteUser(aId), admin.auth.admin.deleteUser(bId)]);
  }
}

void runLocalProof();

// Offline regression check for the workout-search cache. Uses an in-memory store
// and a counting fake generator: no network, no OpenAI, no Supabase.
import assert from "node:assert/strict";
import { getOrCreateGuide, normalizeQuery, type CachedGuide, type GuideStore } from "../server/services/workoutGuideCache";

const guide = (name: string): CachedGuide => ({
  exercise: name,
  targetMuscles: ["Chest"],
  steps: ["Set up", "Press"],
  safetyTips: ["Warm up"],
  found: true,
});

function memoryStore(): GuideStore & { rows: Map<string, CachedGuide> } {
  const rows = new Map<string, CachedGuide>();
  return {
    rows,
    async get(key) { return rows.get(key) ?? null; },
    async put(e) { if (!rows.has(e.cacheKey)) rows.set(e.cacheKey, e.guide); },
  };
}

async function run() {
  let failures = 0;
  const check = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); console.log("PASS", name); } catch (e: any) { failures++; console.log("FAIL", name, "-", e.message); }
  };

  await check("repeat and variant spellings make one model call", async () => {
    const store = memoryStore(); let calls = 0;
    const gen = async () => { calls++; return guide("Bench Press"); };
    const a = await getOrCreateGuide(store, "Bench Press", "en", gen);
    const b = await getOrCreateGuide(store, "  bench   press! ", "en", gen);
    const c = await getOrCreateGuide(store, "BENCH PRESS", "en", gen);
    assert.equal(calls, 1); assert.equal(a.fromCache, false); assert.equal(b.fromCache, true); assert.equal(c.fromCache, true);
  });

  await check("English and Spanish are cached separately", async () => {
    const store = memoryStore(); let calls = 0;
    const gen = async () => { calls++; return guide("x"); };
    await getOrCreateGuide(store, "squat", "en", gen);
    await getOrCreateGuide(store, "squat", "es", gen);
    assert.equal(calls, 2);
  });

  await check("not-found guides are not cached", async () => {
    const store = memoryStore(); let calls = 0;
    const gen = async () => { calls++; return { exercise: "", targetMuscles: [], steps: [], safetyTips: [], found: false }; };
    await getOrCreateGuide(store, "asdfgh", "en", gen);
    await getOrCreateGuide(store, "asdfgh", "en", gen);
    assert.equal(calls, 2); assert.equal(store.rows.size, 0);
  });

  await check("generator failure propagates and stores nothing", async () => {
    const store = memoryStore();
    await assert.rejects(() => getOrCreateGuide(store, "row", "en", async () => { throw new Error("openai down"); }), /openai down/);
    assert.equal(store.rows.size, 0);
  });

  await check("store read/write errors fall back to generating (missing table)", async () => {
    const broken: GuideStore = { async get() { throw new Error("relation does not exist"); }, async put() { throw new Error("relation does not exist"); } };
    const r = await getOrCreateGuide(broken, "deadlift", "en", async () => guide("Deadlift"));
    assert.equal(r.guide.exercise, "Deadlift"); assert.equal(r.fromCache, false);
  });

  await check("null store (Supabase unconfigured) still generates", async () => {
    const r = await getOrCreateGuide(null, "curl", "en", async () => guide("Curl"));
    assert.equal(r.guide.exercise, "Curl");
  });

  await check("over-long query is generated but never cached", async () => {
    const store = memoryStore(); let calls = 0;
    const long = "a ".repeat(60);
    assert.equal(normalizeQuery(long), null);
    const gen = async () => { calls++; return guide("x"); };
    await getOrCreateGuide(store, long, "en", gen); await getOrCreateGuide(store, long, "en", gen);
    assert.equal(calls, 2); assert.equal(store.rows.size, 0);
  });

  await check("accents normalize (Sentadilla / sentadílla)", async () => {
    assert.equal(normalizeQuery("Sentadílla"), normalizeQuery("sentadilla"));
  });

  if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
  console.log("\nall passed");
}
run();

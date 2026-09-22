import { createClient } from "@supabase/supabase-js";

export type CachedGuide = {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
};

export interface GuideStore {
  get(cacheKey: string): Promise<CachedGuide | null>;
  put(entry: { cacheKey: string; language: "en" | "es"; queryNormalized: string; guide: CachedGuide }): Promise<void>;
}

const MAX_QUERY_LENGTH = 80;

// Normalizes free text so "Bench  Press!" and "bench press" share one cache entry.
// Returns null when the query is too long to be a plausible exercise name, so
// arbitrary text cannot fill the cache.
export function normalizeQuery(query: string): string | null {
  const normalized = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) return null;
  return normalized;
}

export function buildCacheKey(queryNormalized: string, language: "en" | "es"): string {
  return `${language}:${queryNormalized}`;
}

// Only complete, usable guides are stored. Not-found answers and fallbacks are
// never cached, so a typo or a temporary failure cannot stick.
export function isCacheableGuide(guide: CachedGuide | null | undefined): guide is CachedGuide {
  return Boolean(
    guide &&
      guide.found &&
      typeof guide.exercise === "string" &&
      guide.exercise.trim() &&
      Array.isArray(guide.steps) &&
      guide.steps.length > 0 &&
      guide.steps.every((s) => typeof s === "string") &&
      Array.isArray(guide.safetyTips) &&
      guide.safetyTips.every((s) => typeof s === "string") &&
      Array.isArray(guide.targetMuscles) &&
      guide.targetMuscles.every((s) => typeof s === "string")
  );
}

export async function getOrCreateGuide(
  store: GuideStore | null,
  query: string,
  language: "en" | "es",
  generate: () => Promise<CachedGuide>
): Promise<{ guide: CachedGuide; fromCache: boolean }> {
  const queryNormalized = normalizeQuery(query);
  const cacheKey = queryNormalized ? buildCacheKey(queryNormalized, language) : null;

  if (store && cacheKey) {
    try {
      const cached = await store.get(cacheKey);
      if (isCacheableGuide(cached)) return { guide: cached, fromCache: true };
    } catch (error: any) {
      console.error("[workout-guide-cache] read failed:", error?.message ?? error);
    }
  }

  const guide = await generate();

  if (store && cacheKey && queryNormalized && isCacheableGuide(guide)) {
    try {
      await store.put({ cacheKey, language, queryNormalized, guide });
    } catch (error: any) {
      console.error("[workout-guide-cache] write failed:", error?.message ?? error);
    }
  }

  return { guide, fromCache: false };
}

let supabaseStore: GuideStore | null | undefined;

// Returns null when Supabase is not configured. A missing table (migration not
// yet applied) surfaces as a read/write error, which getOrCreateGuide logs and
// ignores, so the route keeps working exactly as before.
export function getSupabaseGuideStore(): GuideStore | null {
  if (supabaseStore !== undefined) return supabaseStore;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseStore = null;
    return supabaseStore;
  }
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  supabaseStore = {
    async get(cacheKey) {
      const { data, error } = await client
        .from("workout_guides")
        .select("guide")
        .eq("cache_key", cacheKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) void client.rpc("bump_workout_guide_hit", { p_cache_key: cacheKey }).then(() => undefined, () => undefined);
      return (data?.guide as CachedGuide | undefined) ?? null;
    },
    async put({ cacheKey, language, queryNormalized, guide }) {
      const { error } = await client
        .from("workout_guides")
        .upsert({ cache_key: cacheKey, language, query_normalized: queryNormalized, guide }, { onConflict: "cache_key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
  };
  return supabaseStore;
}

import dotenv from "dotenv";

dotenv.config();

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "").replace(/\/+$/, "");
const TIMEOUT_MS = 15000;
const ALLOW_LOCAL = process.env.RELEASE_SMOKE_ALLOW_LOCAL === "1";

type Check = {
  name: string;
  run: () => Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

const checks: Check[] = [
  {
    name: "API URL configured",
    run: async () => {
      assert(API_BASE, "EXPO_PUBLIC_API_BASE_URL or API_BASE_URL is required.");
      assert(
        ALLOW_LOCAL || !/localhost|127\.0\.0\.1|10\.0\.0\./.test(API_BASE),
        `API_BASE points at a local address: ${API_BASE}`
      );
    },
  },
  {
    name: "Health endpoint",
    run: async () => {
      const { response, data } = await request("/health");
      assert(response.ok, `Health failed with ${response.status}`);
      assert(data?.status === "ok", "Health did not return { status: 'ok' }.");
    },
  },
  {
    name: "Dependency health",
    run: async () => {
      const { response, data } = await request("/api/dependency-health");
      assert(response.ok, `Dependency health failed with ${response.status}: ${JSON.stringify(data)}`);
      assert(data?.status === "ok", "Dependency health did not return { status: 'ok' }.");
      assert(data?.checks?.supabaseReachable === true, "Supabase dependency is not reachable.");
      assert(data?.checks?.anthropicConfigured === true, "Anthropic dependency is not configured.");
      assert(data?.checks?.geminiConfigured === true, "Gemini dependency is not configured.");
    },
  },
  {
    name: "Readiness endpoint",
    run: async () => {
      const { response, data } = await request("/health/ready");
      assert(response.ok, `Readiness failed with ${response.status}: ${JSON.stringify(data)}`);
      assert(data?.status === "ok" && data?.ready === true, "Readiness did not return a ready service.");
    },
  },
  {
    name: "API capabilities",
    run: async () => {
      const { response, data } = await request("/api/capabilities");
      assert(response.ok, `Capabilities failed with ${response.status}`);
      assert(data?.contractVersion === 1, "Unexpected API contract version.");
      assert(data?.requestTracing === true, "Request tracing capability is not enabled.");
      assert(data?.trainer?.idempotentJobs === true, "Trainer job idempotency is not enabled.");
      assert(data?.trainer?.ownedJobs === true, "Trainer job ownership is not enabled.");
    },
  },
  {
    name: "Equipment search",
    run: async () => {
      const { response, data } = await request("/api/search?q=treadmill");
      assert(response.ok, `Search failed with ${response.status}`);
      assert(Array.isArray(data), "Search did not return an array.");
    },
  },
  {
    name: "Videos",
    run: async () => {
      const { response, data } = await request("/api/videos?name=bench%20press");
      assert(response.ok, `Videos failed with ${response.status}`);
      assert(Array.isArray(data), "Videos did not return an array.");
    },
  },
  {
    name: "Workout guide",
    run: async () => {
      const { response, data } = await request("/api/workout-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "bench press" }),
      });
      assert(response.ok, `Workout guide failed with ${response.status}`);
      assert(data?.found === true && Array.isArray(data.steps), "Workout guide returned an invalid payload.");
    },
  },
  {
    name: "Legacy workout guide route",
    run: async () => {
      const { response, data } = await request("/workout-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "bench press" }),
      });
      assert(response.ok, `Legacy workout route failed with ${response.status}`);
      assert(data?.found === true && Array.isArray(data.steps), "Legacy workout route returned an invalid payload.");
    },
  },
  {
    name: "Trainer chat",
    run: async () => {
      const { response, data } = await request("/api/coach-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "chat", units: "lbs", question: "Give me one short warmup tip." }),
      });
      assert(response.ok, `Trainer chat failed with ${response.status}`);
      assert(typeof data?.message === "string" || typeof data?.summary === "string", "Trainer returned an invalid payload.");
    },
  },
];

async function main() {
  for (const check of checks) {
    process.stdout.write(`Checking ${check.name}... `);
    await check.run();
    console.log("ok");
  }
}

main().catch((error) => {
  console.error("\nRelease smoke test failed:");
  console.error(error.message || error);
  process.exit(1);
});

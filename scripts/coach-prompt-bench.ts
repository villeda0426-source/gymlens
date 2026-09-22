// Offline-to-OpenAI benchmark: compares the Coach system prompt at git HEAD with the
// working-tree prompt on identical intake requests. Calls OpenAI directly (paid, small),
// does NOT write to Supabase or ai_usage_events. Usage:
//   SUPABASE_URL= npx ts-node scripts/coach-prompt-bench.ts [runsPerScenario]
import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });
import { execSync } from "node:child_process";
import OpenAI from "openai";
import { COACH_TRAINER_SYSTEM_PROMPT, COACH_TRAINER_MODEL, parseCoachResponse } from "../server/services/coachTrainerService";

function baselinePrompt(): string {
  const src = execSync("git show HEAD:server/services/coachTrainerService.ts", { encoding: "utf8", maxBuffer: 10_000_000 });
  const start = src.indexOf("COACH_TRAINER_SYSTEM_PROMPT = `") + "COACH_TRAINER_SYSTEM_PROMPT = `".length;
  const end = src.indexOf("`;", start);
  return src.slice(start, end).replace(/\\`/g, "`");
}

const scenarios = [
  { id: "gym-4day", units: "lbs", language: "en", msg: "I'm intermediate, want to build muscle, can train 4 days a week at a full gym, no injuries. 60 minutes per session." },
  { id: "home-3day-es", units: "kg", language: "es", msg: "Soy principiante, quiero perder grasa y ganar fuerza, 3 días por semana en casa con mancuernas y bandas, sin lesiones. 40 minutos." },
];

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const runs = Number(process.argv[2] || 2);

async function once(prompt: string, s: (typeof scenarios)[number]) {
  const t0 = Date.now();
  const r = await client.responses.create({
    model: COACH_TRAINER_MODEL,
    instructions: prompt,
    input: [{ role: "user", content: `CONTEXT: ${JSON.stringify({ mode: "intake", units: s.units, language: s.language })}\n\n${s.msg}` }],
    max_output_tokens: 5000,
    reasoning: { effort: "low" },
  });
  const text = r.output_text || "";
  let valid = false, status = "?", sessions = 0, exercises = 0, why = "";
  try {
    const j: any = parseCoachResponse(text); // same parser production uses (fence strip + jsonrepair + schema check)
    valid = true; status = j.status; sessions = j.plan?.sessions?.length ?? 0; exercises = j.plan?.sessions?.reduce((n: number, x: any) => n + x.exercises.length, 0) ?? 0;
  } catch (e: any) { why = e.message.slice(0, 70); if (process.env.DUMP_DIR) require("node:fs").writeFileSync(`${process.env.DUMP_DIR}/fail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`, text); }
  return { ms: Date.now() - t0, inTok: r.usage?.input_tokens ?? 0, cached: (r.usage as any)?.input_tokens_details?.cached_tokens ?? 0, outTok: r.usage?.output_tokens ?? 0, reasoning: (r.usage as any)?.output_tokens_details?.reasoning_tokens ?? 0, valid, why, status, sessions, exercises };
}

(async () => {
  const variants: Record<string, string> = process.env.ONLY_CURRENT ? { current: COACH_TRAINER_SYSTEM_PROMPT } : { baseline: baselinePrompt(), current: COACH_TRAINER_SYSTEM_PROMPT };
  console.log("prompt chars:", Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, v.length])));
  const rows: any[] = [];
  await Promise.all(Object.entries(variants).flatMap(([name, prompt]) => scenarios.flatMap((s) =>
    Array.from({ length: runs }, async () => { try { rows.push({ variant: name, scenario: s.id, ...(await once(prompt, s)) }); } catch (e: any) { rows.push({ variant: name, scenario: s.id, error: e.message }); } })
  )));
  rows.sort((a, b) => (a.variant + a.scenario).localeCompare(b.variant + b.scenario));
  console.table(rows);
  const avg = (v: string, k: string) => { const x = rows.filter((r) => r.variant === v && !r.error); return Math.round(x.reduce((n, r) => n + r[k], 0) / Math.max(1, x.length)); };
  console.table(["baseline", "current"].map((v) => ({ variant: v, avgMs: avg(v, "ms"), avgInTok: avg(v, "inTok"), avgOutTok: avg(v, "outTok"), avgReasoning: avg(v, "reasoning"), validRate: rows.filter((r) => r.variant === v && r.valid).length + "/" + rows.filter((r) => r.variant === v).length })));
})();

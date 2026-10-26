// Estimated AI cost per call, from OpenAI's published standard (non-batch)
// rates, USD per 1M tokens. Checked 2026-10-26 against
// developers.openai.com/api/docs/models/gpt-5-mini and /gpt-5-nano.
// Override without a deploy of code via AI_PRICING_JSON, e.g.
// {"gpt-5-mini":{"input":0.25,"cachedInput":0.025,"output":2}}.
// Unknown models get a null cost rather than a guess.

export const AI_PRICING_VERSION = "openai-2026-10-26";

type Rate = { input: number; cachedInput: number; output: number };

const DEFAULT_RATES: Record<string, Rate> = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
};

function rates(): Record<string, Rate> {
  const raw = process.env.AI_PRICING_JSON;
  if (!raw) return DEFAULT_RATES;
  try {
    return { ...DEFAULT_RATES, ...(JSON.parse(raw) as Record<string, Rate>) };
  } catch {
    return DEFAULT_RATES;
  }
}

// `inputTokens` includes cached tokens (as OpenAI reports them).
export function estimateCostUsd(model: string, inputTokens: number, cachedInputTokens: number, outputTokens: number): number | null {
  const rate = rates()[model] ?? rates()[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  if (!rate) return null;
  const cached = Math.min(Math.max(cachedInputTokens, 0), Math.max(inputTokens, 0));
  const cost = ((inputTokens - cached) * rate.input + cached * rate.cachedInput + outputTokens * rate.output) / 1_000_000;
  return Math.round(cost * 1e8) / 1e8;
}

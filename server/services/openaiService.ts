import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { currentContext } from "../lib/requestContext";
import { AI_PRICING_VERSION, estimateCostUsd } from "../lib/aiPricing";

let client: OpenAI | null = null;
let telemetryClient: any = null;

type UsageEntry = {
  feature: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  succeeded: boolean;
  errorClass?: string | null;
};

// Coarse failure class for telemetry — never the raw message, which can echo
// model output or request content.
export function classifyAiError(error: unknown): string {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return `http_${status}`;
  const name = (error as { name?: unknown })?.name;
  if (name === "AbortError" || name === "APIUserAbortError") return "timeout";
  if (error instanceof SyntaxError) return "invalid_json";
  const message = error instanceof Error ? error.message : "";
  if (/no structured output|empty text response/i.test(message)) return "empty_output";
  if (/not configured/i.test(message)) return "not_configured";
  return "error";
}

// Inserts one ai_usage_events row, attributed via the request context (see
// server/lib/requestContext.ts): user only from a verified token, "system"
// for scripts, "anonymous" when a client call has no valid session. Never
// awaited by callers and never throws. Falls back to the original columns if
// the attribution migration hasn't been applied yet.
function recordAiUsage(entry: UsageEntry) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  telemetryClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const context = currentContext();
  const legacyRow = {
    feature: entry.feature,
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    latency_ms: entry.latencyMs,
    succeeded: entry.succeeded,
  };
  void (async () => {
    try {
      const userId = context ? await context.resolveUserId() : null;
      const actor = context?.actor ?? (context ? (userId ? "user" : "anonymous") : "system");
      const { error } = await telemetryClient.from("ai_usage_events").insert({
        ...legacyRow,
        user_id: userId,
        actor,
        provider: "openai",
        cached_input_tokens: entry.cachedInputTokens,
        cost_usd: estimateCostUsd(entry.model, entry.inputTokens, entry.cachedInputTokens, entry.outputTokens),
        pricing_version: AI_PRICING_VERSION,
        error_class: entry.succeeded ? null : entry.errorClass ?? "error",
        request_id: context?.requestId ?? null,
        app_version: context?.appVersion ?? null,
        build_number: context?.buildNumber ?? null,
        platform: context?.platform ?? null,
        installation_id: context?.installationId ?? null,
      });
      if (!error) return;
      if (/column|schema cache/i.test(error.message)) {
        const legacy = await telemetryClient.from("ai_usage_events").insert({ ...legacyRow, user_id: userId });
        if (!legacy.error) return;
      }
      if (!/does not exist/i.test(error.message)) console.error("[ai-usage] telemetry error:", error.message);
    } catch (error: any) {
      console.error("[ai-usage] telemetry error:", error?.message ?? error);
    }
  })();
}

function usageFrom(response: { usage?: any } | null | undefined) {
  return {
    inputTokens: response?.usage?.input_tokens ?? 0,
    cachedInputTokens: response?.usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: response?.usage?.output_tokens ?? 0,
  };
}

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
export const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_DEFAULT_MODEL;

type JsonSchema = Record<string, unknown>;

type JsonRequestOptions = {
  model?: string;
  instructions: string;
  input: string | Array<Record<string, unknown>>;
  schemaName: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
  timeoutMs?: number;
  telemetryFeature?: string;
};

export async function createStructuredResponse<T>({
  model = OPENAI_DEFAULT_MODEL,
  instructions,
  input,
  schemaName,
  schema,
  maxOutputTokens = 4000,
  timeoutMs = 60000,
  telemetryFeature = "structured_generation",
}: JsonRequestOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let response: Awaited<ReturnType<OpenAI["responses"]["create"]>> | null = null;

  try {
    response = await getClient().responses.create(
      {
        model,
        instructions,
        input: input as any,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: "low" },
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
      },
      { signal: controller.signal }
    );

    if (!response.output_text) {
      throw new Error(`OpenAI returned no structured output for ${schemaName}.`);
    }

    const parsed = JSON.parse(response.output_text) as T;
    recordAiUsage({ feature: telemetryFeature, model, ...usageFrom(response), latencyMs: Date.now() - startedAt, succeeded: true });
    return parsed;
  } catch (error) {
    recordAiUsage({
      feature: telemetryFeature,
      model,
      ...usageFrom(response),
      latencyMs: Date.now() - startedAt,
      succeeded: false,
      errorClass: classifyAiError(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createTextResponse({
  model = OPENAI_DEFAULT_MODEL,
  instructions,
  input,
  maxOutputTokens = 300,
  timeoutMs = 30000,
  telemetryFeature = "text_generation",
}: Omit<JsonRequestOptions, "schemaName" | "schema">): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let response: Awaited<ReturnType<OpenAI["responses"]["create"]>> | null = null;

  try {
    response = await getClient().responses.create(
      {
        model,
        instructions,
        input: input as any,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: "low" },
      },
      { signal: controller.signal }
    );

    const text = response.output_text?.trim();
    if (!text) throw new Error("OpenAI returned an empty text response.");
    recordAiUsage({ feature: telemetryFeature, model, ...usageFrom(response), latencyMs: Date.now() - startedAt, succeeded: true });
    return text;
  } catch (error) {
    recordAiUsage({
      feature: telemetryFeature,
      model,
      ...usageFrom(response),
      latencyMs: Date.now() - startedAt,
      succeeded: false,
      errorClass: classifyAiError(error),
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function imageDataUrl(base64Image: string): string {
  const header = base64Image.slice(0, 16);
  const mimeType = header.startsWith("iVBORw")
    ? "image/png"
    : header.startsWith("R0lGOD")
      ? "image/gif"
      : header.startsWith("UklGR")
        ? "image/webp"
        : "image/jpeg";

  return `data:${mimeType};base64,${base64Image}`;
}

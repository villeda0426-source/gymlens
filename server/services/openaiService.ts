import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

let client: OpenAI | null = null;
let telemetryClient: any = null;

function recordAiUsage(entry: {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  succeeded: boolean;
}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  telemetryClient ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  void telemetryClient.from("ai_usage_events").insert({
    feature: entry.feature,
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    latency_ms: entry.latencyMs,
    succeeded: entry.succeeded,
  }).then(({ error }: { error: { message: string } | null }) => {
    if (error && !/does not exist/i.test(error.message)) console.error("[ai-usage] telemetry error:", error.message);
  });
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

  try {
    const response = await getClient().responses.create(
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

    recordAiUsage({
      feature: telemetryFeature,
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      succeeded: true,
    });

    return JSON.parse(response.output_text) as T;
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

  try {
    const response = await getClient().responses.create(
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
    recordAiUsage({
      feature: telemetryFeature,
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      succeeded: true,
    });
    return text;
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

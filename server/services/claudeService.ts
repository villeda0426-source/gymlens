import Anthropic from "@anthropic-ai/sdk";
import { EquipmentIdentification, EQUIPMENT_SYSTEM_PROMPT } from "../../lib/anthropic";

let client: Anthropic | null = null;

const FAST_VISION_MODEL =
  process.env.ANTHROPIC_VISION_FAST_MODEL || "claude-haiku-4-5-20251001";
const VISION_MODEL =
  process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-4-6";
const FAST_VISION_TIMEOUT_MS = Number.parseInt(
  process.env.ANTHROPIC_VISION_FAST_TIMEOUT_MS || "10000",
  10
);
const VISION_TIMEOUT_MS = Number.parseInt(
  process.env.ANTHROPIC_VISION_TIMEOUT_MS || "35000",
  10
);

type ClaudeMessageCreator = (
  request: any,
  options: Anthropic.RequestOptions
) => Promise<Anthropic.Message>;

export class ClaudeProviderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude provider timed out after ${timeoutMs}ms.`);
    this.name = "ClaudeProviderTimeoutError";
  }
}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  }
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 0,
  });
  return client;
}

export async function callClaudeMessage(
  request: any,
  options: {
    timeoutMs: number;
    createMessage?: ClaudeMessageCreator;
  }
): Promise<Anthropic.Message> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const createMessage = options.createMessage ??
    ((body, requestOptions) => getClient().messages.create(body, requestOptions));

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ClaudeProviderTimeoutError(options.timeoutMs));
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => createMessage(request, {
        signal: controller.signal,
        timeout: options.timeoutMs,
        maxRetries: 0,
      })),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function detectMediaType(base64Image: string): SupportedMediaType {
  const header = base64Image.slice(0, 16);
  if (header.startsWith("/9j/")) return "image/jpeg";
  if (header.startsWith("iVBORw")) return "image/png";
  if (header.startsWith("R0lGOD")) return "image/gif";
  if (header.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

/** Cheap Haiku call — returns just the equipment name, nothing else. */
export async function extractEquipmentName(base64Image: string): Promise<string> {
  const mediaType = detectMediaType(base64Image);
  const response = await callClaudeMessage({
    model: FAST_VISION_MODEL,
    max_tokens: 32,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image },
          },
          {
            type: "text",
            text: "What gym equipment is shown? Reply with ONLY the equipment name (2–5 words). No punctuation, no explanation.",
          },
        ],
      },
    ],
  }, { timeoutMs: FAST_VISION_TIMEOUT_MS });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim().replace(/[.!?,]/g, "");
}

export async function identifyEquipment(base64Image: string): Promise<EquipmentIdentification> {
  const mediaType = detectMediaType(base64Image);
  console.log("[claudeService] media_type:", mediaType, "| base64 length:", base64Image.length);

  const response = await callClaudeMessage({
    model: VISION_MODEL,
    max_tokens: 2048,
    system: EQUIPMENT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: "Identify this gym equipment and respond with JSON only.",
          },
        ],
      },
    ],
  }, { timeoutMs: VISION_TIMEOUT_MS });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  console.log("[claudeService] raw response length:", text.length);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[claudeService] no JSON in response:", text.slice(0, 200));
    throw new Error("AI did not return valid JSON");
  }

  let parsed: EquipmentIdentification;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("[claudeService] JSON parse failed:", jsonMatch[0].slice(0, 200));
    throw new Error("AI returned malformed JSON");
  }

  return parsed;
}

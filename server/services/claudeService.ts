import Anthropic from "@anthropic-ai/sdk";
import { EquipmentIdentification, EQUIPMENT_SYSTEM_PROMPT } from "../../lib/anthropic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
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
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim().replace(/[.!?,]/g, "");
}

export async function identifyEquipment(base64Image: string): Promise<EquipmentIdentification> {
  const mediaType = detectMediaType(base64Image);
  console.log("[claudeService] media_type:", mediaType, "| base64 length:", base64Image.length);

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
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
  });

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

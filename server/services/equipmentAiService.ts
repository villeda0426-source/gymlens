import {
  EQUIPMENT_IDENTIFICATION_SCHEMA,
  EQUIPMENT_SYSTEM_PROMPT,
  EquipmentIdentification,
} from "../../lib/ai";
import {
  createStructuredResponse,
  createTextResponse,
  imageDataUrl,
  OPENAI_VISION_MODEL,
} from "./openaiService";

export async function extractEquipmentName(base64Image: string): Promise<string> {
  const text = await createTextResponse({
    model: OPENAI_VISION_MODEL,
    instructions: "Identify gym equipment from an image. Return only its common English name in 2-5 words, without punctuation or explanation.",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "What gym equipment is shown?" },
          { type: "input_image", image_url: imageDataUrl(base64Image), detail: "low" },
        ],
      },
    ],
    maxOutputTokens: 200,
    timeoutMs: 25000,
  });

  return text.replace(/[.!?,]/g, "").trim();
}

export async function identifyEquipment(base64Image: string): Promise<EquipmentIdentification> {
  return createStructuredResponse<EquipmentIdentification>({
    model: OPENAI_VISION_MODEL,
    instructions: EQUIPMENT_SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Identify this gym equipment. Provide bilingual instructions, conservative safety guidance, and a useful YouTube tutorial search query.",
          },
          { type: "input_image", image_url: imageDataUrl(base64Image), detail: "high" },
        ],
      },
    ],
    schemaName: "equipment_identification",
    schema: EQUIPMENT_IDENTIFICATION_SCHEMA,
    maxOutputTokens: 2200,
    timeoutMs: 60000,
  });
}

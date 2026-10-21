import {
  EQUIPMENT_IDENTIFICATION_SCHEMA,
  EQUIPMENT_OBSERVATION_PROMPT,
  EQUIPMENT_OBSERVATION_SCHEMA,
  EQUIPMENT_SYSTEM_PROMPT,
  EquipmentIdentification,
  EquipmentObservation,
} from "../../lib/ai";
import {
  createStructuredResponse,
  imageDataUrl,
  OPENAI_VISION_MODEL,
} from "./openaiService";

// Scan step 1: what the photo shows, including any legible brand/model
// text. High detail so model plates and decals can actually be read.
export async function observeEquipment(base64Image: string): Promise<EquipmentObservation> {
  return createStructuredResponse<EquipmentObservation>({
    model: OPENAI_VISION_MODEL,
    instructions: EQUIPMENT_OBSERVATION_PROMPT,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Describe the gym equipment in this photo." },
          { type: "input_image", image_url: imageDataUrl(base64Image), detail: "high" },
        ],
      },
    ],
    schemaName: "equipment_observation",
    schema: EQUIPMENT_OBSERVATION_SCHEMA,
    maxOutputTokens: 1200,
    timeoutMs: 30000,
  });
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

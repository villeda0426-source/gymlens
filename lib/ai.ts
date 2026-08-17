export const EQUIPMENT_SYSTEM_PROMPT = `You are a gym equipment identification expert. Analyze the image and return accurate, beginner-safe equipment guidance. Do not diagnose injuries or make medical claims.`;

export interface EquipmentIdentification {
  name: string;
  name_es: string;
  category: "machine" | "free_weight" | "cable" | "accessory" | "cardio";
  confidence: number;
  description: string;
  description_es: string;
  muscle_groups: string[];
  tutorial_steps: Array<{
    step: number;
    instruction: string;
    instruction_es: string;
  }>;
  safety_tips: string[];
  safety_tips_es: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  search_query: string;
}

export const EQUIPMENT_IDENTIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "name_es",
    "category",
    "confidence",
    "description",
    "description_es",
    "muscle_groups",
    "tutorial_steps",
    "safety_tips",
    "safety_tips_es",
    "difficulty",
    "search_query",
  ],
  properties: {
    name: { type: "string" },
    name_es: { type: "string" },
    category: { type: "string", enum: ["machine", "free_weight", "cable", "accessory", "cardio"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    description: { type: "string" },
    description_es: { type: "string" },
    muscle_groups: { type: "array", items: { type: "string" } },
    tutorial_steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["step", "instruction", "instruction_es"],
        properties: {
          step: { type: "integer" },
          instruction: { type: "string" },
          instruction_es: { type: "string" },
        },
      },
    },
    safety_tips: { type: "array", items: { type: "string" } },
    safety_tips_es: { type: "array", items: { type: "string" } },
    difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    search_query: { type: "string" },
  },
} as const;

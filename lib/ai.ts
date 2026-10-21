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

// ─── Equipment observation (scan step 1) ─────────────────────────────────────
// What the photo itself shows, kept separate from any catalog lookup: the
// generic equipment type, how sure the model is of that type from the image,
// and only the brand/model text that is actually printed and legible.
// server/services/equipmentScanService.ts matches this against the
// Supabase equipment catalog; nothing here is a catalog identity.
export const EQUIPMENT_OBSERVATION_PROMPT = `You look at one photo from a gym and describe the equipment in it. Be literal and conservative.
- equipment_type: the generic kind of equipment in plain English (e.g. "leg press", "smith machine", "treadmill", "seated chest press"). Never a brand or model.
- alternative_types: up to 3 other generic types it could plausibly be, most likely first. Empty if the type is clear.
- type_confidence: your honest probability (0-1) that equipment_type is correct, judged from the photo alone. Lower it when the machine is cropped, blurry, or similar to other machines.
- brand_text and model_text: ONLY text you can actually read printed on the equipment (logo wordmark, model plate, decal, console). Copy it as printed. Use null when nothing is legible. Never infer a brand or model from shape, color, or styling.
- other_label_text: any other legible printed words or codes on the equipment.
- full_machine_visible: whether the whole piece of equipment is in frame.
- label_legibility: "clear" if a brand/model label is readable, "partial" if some label text is visible but not fully readable, "none" otherwise.
- is_gym_equipment: false if the photo does not show exercise equipment.`;

export type EquipmentResistance =
  | "plate_loaded"
  | "weight_stack"
  | "cable"
  | "bodyweight"
  | "free_weight"
  | "air"
  | "pneumatic"
  | "electronic"
  | "none"
  | "unknown";

export interface EquipmentObservation {
  is_gym_equipment: boolean;
  equipment_type: string;
  equipment_type_es: string;
  alternative_types: string[];
  category: "machine" | "free_weight" | "cable" | "accessory" | "cardio" | "bodyweight" | "other";
  type_confidence: number;
  resistance: EquipmentResistance;
  visible_features: string[];
  brand_text: string | null;
  model_text: string | null;
  other_label_text: string[];
  full_machine_visible: boolean;
  label_legibility: "none" | "partial" | "clear";
}

export const EQUIPMENT_OBSERVATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_gym_equipment",
    "equipment_type",
    "equipment_type_es",
    "alternative_types",
    "category",
    "type_confidence",
    "resistance",
    "visible_features",
    "brand_text",
    "model_text",
    "other_label_text",
    "full_machine_visible",
    "label_legibility",
  ],
  properties: {
    is_gym_equipment: { type: "boolean" },
    equipment_type: { type: "string" },
    equipment_type_es: { type: "string" },
    alternative_types: { type: "array", items: { type: "string" }, maxItems: 3 },
    category: { type: "string", enum: ["machine", "free_weight", "cable", "accessory", "cardio", "bodyweight", "other"] },
    type_confidence: { type: "number", minimum: 0, maximum: 1 },
    resistance: {
      type: "string",
      enum: ["plate_loaded", "weight_stack", "cable", "bodyweight", "free_weight", "air", "pneumatic", "electronic", "none", "unknown"],
    },
    visible_features: { type: "array", items: { type: "string" }, maxItems: 6 },
    brand_text: { type: ["string", "null"] },
    model_text: { type: ["string", "null"] },
    other_label_text: { type: "array", items: { type: "string" }, maxItems: 8 },
    full_machine_visible: { type: "boolean" },
    label_legibility: { type: "string", enum: ["none", "partial", "clear"] },
  },
} as const;

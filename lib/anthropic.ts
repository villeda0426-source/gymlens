import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const EQUIPMENT_SYSTEM_PROMPT = `You are a gym equipment identification expert. Analyze the image and respond ONLY with valid JSON (no markdown, no code blocks, no extra text):
{
  "name": "Equipment name in English",
  "name_es": "Equipment name in Spanish",
  "category": "machine|free_weight|cable|accessory|cardio",
  "confidence": 0.0-1.0,
  "description": "2-sentence description",
  "description_es": "Spanish description",
  "muscle_groups": ["primary", "secondary"],
  "tutorial_steps": [
    {"step": 1, "instruction": "...", "instruction_es": "..."}
  ],
  "safety_tips": ["tip1", "tip2", "tip3"],
  "safety_tips_es": ["tip1_es", "tip2_es", "tip3_es"],
  "difficulty": "beginner|intermediate|advanced",
  "search_query": "best YouTube search query for this equipment tutorial"
}`;

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

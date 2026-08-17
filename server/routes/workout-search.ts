import { Router, Request, Response } from "express";
import { createStructuredResponse, OPENAI_DEFAULT_MODEL } from "../services/openaiService";

const router = Router();

type WorkoutGuide = {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
};

const WORKOUT_MODEL = process.env.OPENAI_WORKOUT_MODEL || OPENAI_DEFAULT_MODEL;

const MUSCLE_HINTS: Array<{ pattern: RegExp; muscles: string[] }> = [
  { pattern: /bench|push[- ]?up|chest|fly|press/i, muscles: ["Chest", "Shoulders", "Triceps"] },
  { pattern: /row|pull[- ]?up|pulldown|lat|deadlift/i, muscles: ["Back", "Biceps", "Core"] },
  { pattern: /curl|bicep/i, muscles: ["Biceps"] },
  { pattern: /tricep|dip|extension|pushdown/i, muscles: ["Triceps"] },
  { pattern: /squat|lunge|leg press|quad/i, muscles: ["Quads", "Glutes", "Hamstrings"] },
  { pattern: /hinge|romanian|rdl|hamstring/i, muscles: ["Hamstrings", "Glutes", "Back"] },
  { pattern: /hip thrust|glute|bridge/i, muscles: ["Glutes", "Hamstrings"] },
  { pattern: /calf/i, muscles: ["Calves"] },
  { pattern: /plank|crunch|sit[- ]?up|core|ab|oblique/i, muscles: ["Core"] },
  { pattern: /shoulder|overhead|lateral raise|front raise|rear delt/i, muscles: ["Shoulders", "Triceps"] },
];

function titleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferMuscles(query: string): string[] {
  for (const hint of MUSCLE_HINTS) {
    if (hint.pattern.test(query)) return hint.muscles;
  }
  return ["Full Body"];
}

function fallbackWorkoutGuide(query: string, language: "en" | "es"): WorkoutGuide {
  const exercise = titleCase(query);
  return {
    exercise,
    targetMuscles: inferMuscles(query),
    found: true,
    steps: language === "es" ? [
      `Prepárate para ${exercise} con una postura estable y respiración controlada.`,
      "Recorre el rango de movimiento con suficiente control para sentir trabajar los músculos objetivo.",
      "Usa una carga o intensidad que te permita completar cada repetición con buena técnica.",
      "Detén la serie si pierdes la técnica, aparece dolor o ya no puedes controlar el movimiento.",
    ] : [
      `Set up for ${exercise} with a stable stance and controlled breathing.`,
      "Move through the range of motion slowly enough that you can feel the target muscles working.",
      "Use a load or intensity that lets you finish every rep with clean form.",
      "Stop the set if your form breaks, pain appears, or you can no longer control the movement.",
    ],
    safetyTips: language === "es" ? [
      "Calienta primero y comienza con menos peso del que crees necesitar.",
      "Mantén el movimiento fluido, sin rebotes ni prisas.",
      "Si sientes algo agudo, inestable o doloroso, detente y elige una variante más segura.",
    ] : [
      "Warm up first and start lighter than you think you need.",
      "Keep the movement smooth instead of bouncing or rushing.",
      "If anything feels sharp, unstable, or painful, stop and choose a safer variation.",
    ],
  };
}

async function getWorkoutGuide(query: string, language: "en" | "es"): Promise<WorkoutGuide> {
  return createStructuredResponse<WorkoutGuide>({
    model: WORKOUT_MODEL,
    instructions:
      `You are a certified strength coach writing a quick gym-floor exercise guide. If the query is not a real exercise or is too vague to answer safely, set found to false and keep arrays empty. For real exercises, use concise beginner-friendly steps and conservative safety tips. Do not diagnose or treat medical conditions. Write every user-facing value in ${language === "es" ? "neutral Latin American Spanish" : "English"}.`,
    input: `Exercise query: ${query}`,
    schemaName: "workout_guide",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["exercise", "targetMuscles", "steps", "safetyTips", "found"],
      properties: {
        exercise: { type: "string" },
        targetMuscles: { type: "array", items: { type: "string" } },
        steps: { type: "array", items: { type: "string" } },
        safetyTips: { type: "array", items: { type: "string" } },
        found: { type: "boolean" },
      },
    },
    maxOutputTokens: 900,
    timeoutMs: 30000,
  });
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const language = req.body?.language === "es" ? "es" : "en";

    if (!query) {
      return res.status(400).json({ error: "Enter an exercise name to search." });
    }

    const guide = await getWorkoutGuide(query, language);

    if (!guide || !guide.found || !guide.exercise || guide.steps.length === 0) {
      return res.status(404).json({
        error: "I couldn't find a reliable how-to guide for that workout. Try a more specific exercise name.",
      });
    }

    return res.json(guide);
  } catch (error: any) {
    console.error("[workout-search] error:", error.message ?? error);
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    const language = req.body?.language === "es" ? "es" : "en";
    if (query) return res.json(fallbackWorkoutGuide(query, language));
    return res.status(500).json({ error: error.message || "Workout search is temporarily unavailable." });
  }
});

export default router;

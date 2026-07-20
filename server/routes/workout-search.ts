import { Router, Request, Response } from "express";

const router = Router();

type WorkoutGuide = {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
};

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const RETRYABLE_MODEL_STATUSES = new Set([429, 500, 502, 503, 504]);

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

function fallbackWorkoutGuide(query: string): WorkoutGuide {
  const exercise = titleCase(query);
  return {
    exercise,
    targetMuscles: inferMuscles(query),
    found: true,
    steps: [
      `Set up for ${exercise} with a stable stance and controlled breathing.`,
      "Move through the range of motion slowly enough that you can feel the target muscles working.",
      "Use a load or intensity that lets you finish every rep with clean form.",
      "Stop the set if your form breaks, pain appears, or you can no longer control the movement.",
    ],
    safetyTips: [
      "Warm up first and start lighter than you think you need.",
      "Keep the movement smooth instead of bouncing or rushing.",
      "If anything feels sharp, unstable, or painful, stop and choose a safer variation.",
    ],
  };
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1);
  }

  return withoutFence;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseWorkoutGuide(rawText: string): WorkoutGuide | null {
  try {
    const parsed = JSON.parse(stripJsonFences(rawText));
    return {
      exercise: typeof parsed.exercise === "string" ? parsed.exercise.trim() : "",
      targetMuscles: normalizeStringArray(parsed.targetMuscles),
      steps: normalizeStringArray(parsed.steps),
      safetyTips: normalizeStringArray(parsed.safetyTips),
      found: parsed.found === true,
    };
  } catch (error) {
    console.error("[workout-search] Gemini JSON parse failed:", error);
    return null;
  }
}

function buildPrompt(query: string): string {
  return [
    "You are a certified strength coach writing a quick gym-floor exercise guide.",
    "Return STRICT JSON only. Do not include markdown, code fences, prose, or a preamble.",
    "If the user query is not a real exercise or is too vague to answer safely, set found to false and keep arrays empty.",
    "For real exercises, use beginner-friendly language, concise steps, and safety tips that help avoid injury.",
    "",
    "JSON shape:",
    "{",
    '  "exercise": string,',
    '  "targetMuscles": string[],',
    '  "steps": string[],',
    '  "safetyTips": string[],',
    '  "found": boolean',
    "}",
    "",
    `User query: ${query}`,
  ].join("\n");
}

async function callGemini(query: string, model: string): Promise<{ status: number; text?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 500, error: "GEMINI_API_KEY is not configured on the server." };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(query) }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return { status: response.status, error: errorText };
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("\n");

  return { status: response.status, text };
}

async function getWorkoutGuide(query: string): Promise<WorkoutGuide | null> {
  const requestedModel = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = requestedModel === FALLBACK_MODEL ? [requestedModel] : [requestedModel, FALLBACK_MODEL];

  for (const model of models) {
    const result = await callGemini(query, model);

    if ((result.status === 404 || RETRYABLE_MODEL_STATUSES.has(result.status)) && model !== models[models.length - 1]) {
      console.warn(`[workout-search] Gemini model ${model} returned ${result.status}; trying fallback.`);
      continue;
    }

    if (result.error) {
      console.error(`[workout-search] Gemini ${model} error:`, result.error);
      return fallbackWorkoutGuide(query);
    }

    if (!result.text) {
      throw new Error("Gemini returned an empty workout guide.");
    }

    return parseWorkoutGuide(result.text);
  }

  return null;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";

    if (!query) {
      return res.status(400).json({ error: "Enter an exercise name to search." });
    }

    const guide = await getWorkoutGuide(query);

    if (!guide || !guide.found || !guide.exercise || guide.steps.length === 0) {
      return res.status(404).json({
        error: "I couldn't find a reliable how-to guide for that workout. Try a more specific exercise name.",
      });
    }

    return res.json(guide);
  } catch (error: any) {
    console.error("[workout-search] error:", error.message ?? error);
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (query) return res.json(fallbackWorkoutGuide(query));
    return res.status(500).json({ error: error.message || "Workout search is temporarily unavailable." });
  }
});

export default router;

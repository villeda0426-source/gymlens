import assert from "node:assert/strict";
import {
  resolveWorkoutSearch,
  WorkoutGuide,
  WorkoutGuideGenerator,
} from "../server/routes/workout-search";
import {
  callClaudeMessage,
  ClaudeProviderTimeoutError,
  extractEquipmentName,
} from "../server/services/claudeService";
import {
  createStructuredResponse,
  OpenAIClient,
  setOpenAIClientForTests,
} from "../server/services/openaiService";

async function assertFallback(label: string, error: Error, language: "en" | "es" = "en") {
  const result = await resolveWorkoutSearch("bench press", language, async () => {
    throw error;
  });
  const body = result.body as WorkoutGuide;

  assert.equal(result.status, 200, `${label} must preserve the shipped success response`);
  assert.equal(body.found, true);
  assert.equal(body.exercise, "Bench Press");
  assert(body.steps.length > 0);
  assert(body.safetyTips.length > 0);
  if (language === "es") {
    assert.match(body.steps[0], /Prepárate/);
    assert.deepEqual(body.targetMuscles, ["Pecho", "Hombros", "Tríceps"]);
  }
}

async function main() {
  await assertFallback("missing OpenAI key", new Error("OPENAI_API_KEY is not configured on the server."));
  await assertFallback("provider error", new Error("OpenAI provider returned 503."), "es");
  await assertFallback("provider timeout", new DOMException("The operation was aborted.", "AbortError"));

  const spanishLegFallback = await resolveWorkoutSearch("sentadilla", "es", async () => {
    throw new Error("OpenAI provider returned 503.");
  });
  assert.deepEqual(
    (spanishLegFallback.body as WorkoutGuide).targetMuscles,
    ["Cuádriceps", "Glúteos", "Isquiotibiales"]
  );

  const successGenerator: WorkoutGuideGenerator = async () => ({
    exercise: "Bench Press",
    targetMuscles: ["Chest"],
    steps: ["Use a stable setup."],
    safetyTips: ["Use a spotter."],
    found: true,
  });
  const success = await resolveWorkoutSearch("bench press", "en", successGenerator);
  assert.equal(success.status, 200);
  assert.deepEqual((success.body as WorkoutGuide).targetMuscles, ["Chest"]);

  const invalid = await resolveWorkoutSearch("unknown movement", "en", async () => ({
    exercise: "",
    targetMuscles: [],
    steps: [],
    safetyTips: [],
    found: false,
  }));
  assert.equal(invalid.status, 404);

  const invalidSpanish = await resolveWorkoutSearch("movimiento desconocido", "es", async () => ({
    exercise: "",
    targetMuscles: [],
    steps: [],
    safetyTips: [],
    found: false,
  }));
  assert.equal(invalidSpanish.status, 404);
  assert.match((invalidSpanish.body as { error: string }).error, /No pude encontrar/);

  let openAIOptions: { signal?: AbortSignal; timeout?: number; maxRetries?: number } | undefined;
  let openAIAborted = false;
  const hangingOpenAIClient: OpenAIClient = {
    responses: {
      create: (_body, options) => new Promise((_resolve, reject) => {
        openAIOptions = options;
        options?.signal?.addEventListener("abort", () => {
          openAIAborted = true;
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
    },
  };
  setOpenAIClientForTests(hangingOpenAIClient);
  try {
    await assert.rejects(
      () => createStructuredResponse({
        instructions: "Return a test object.",
        input: "test",
        schemaName: "timeout_test",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
        timeoutMs: 5,
      }),
      (error: unknown) => error instanceof DOMException && error.name === "AbortError"
    );
  } finally {
    setOpenAIClientForTests(null);
  }
  assert.equal(openAIAborted, true, "OpenAI timeout must abort the paid request.");
  assert.equal(openAIOptions?.timeout, 5, "OpenAI call must carry the server timeout.");
  assert.equal(openAIOptions?.maxRetries, 0, "OpenAI call must disable SDK retries.");

  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(
    () => extractEquipmentName("iVBORw0KGgo="),
    /ANTHROPIC_API_KEY is not configured/
  );
  if (originalAnthropicKey) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;

  let requestOptions: Record<string, unknown> | undefined;
  await assert.rejects(
    () => callClaudeMessage({}, {
      timeoutMs: 25,
      createMessage: async (_request, options) => {
        requestOptions = options as unknown as Record<string, unknown>;
        throw new Error("Claude provider returned 503.");
      },
    }),
    /Claude provider returned 503/
  );
  assert.equal(requestOptions?.maxRetries, 0, "Claude calls must not add hidden SDK retries.");
  assert.equal(requestOptions?.timeout, 25, "Claude calls must carry the server timeout.");

  await assert.rejects(
    () => callClaudeMessage({}, {
      timeoutMs: 5,
      createMessage: async () => new Promise(() => undefined),
    }),
    (error: unknown) => error instanceof ClaudeProviderTimeoutError
  );

  console.log("AI provider regression checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

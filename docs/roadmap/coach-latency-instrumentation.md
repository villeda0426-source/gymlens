# Coach Latency Instrumentation

Implemented: August 18, 2026  
Production backend: deployed  
Database migration: applied  
Client render timing: implemented for the next mobile build

## Purpose

The first controlled Coach baseline measured only end-to-end plan time. That was enough to identify latency as a risk but not enough to choose an optimization. Coach jobs now record privacy-safe stage timing so model quality does not need to be reduced blindly.

## Measurements captured

Each `coach_trainer_jobs.timings` object can contain:

| Field | Meaning |
|---|---|
| `queueMs` | Database job creation to server processing start |
| `openAiMs` | Total time inside OpenAI requests, including failed attempts |
| `validationMs` | JSON parsing, schema validation, and plan guardrails |
| `retryMs` | Elapsed recovery time after the first recoverable failure; overlaps model/validation totals |
| `attempts` | Number of model attempts |
| `fallbackUsed` | Whether the fallback model was invoked |
| `processingMs` | Server processing start through final result readiness |
| `databaseSaveMs` | Time to persist the completed or failed result |
| `jobStartRequestMs` | Client time to create the background job |
| `clientPollingMs` | Client time waiting/polling for completion |
| `pollCount` | Number of job-status requests |
| `responseToRenderMs` | Completed response receipt to next rendered frame |
| `clientTotalMs` | Client job creation through rendered result |

These fields are not all additive. For example, `retryMs` overlaps retry model and validation time, and `clientPollingMs` contains the server work occurring while the app waits.

## Privacy boundary

Timing records contain durations, counts, and a fallback boolean only. They do not add prompts, chat messages, workout notes, health details, images, plans, names, or email addresses.

## Security improvement included

Coach job creation and status reads now require an authenticated user. Status reads are restricted by both job ID and `user_id`, closing the previous possibility of reading a job by knowing its identifier.

## Verification completed

- Database column exists as non-null `jsonb` with an empty-object default.
- Production backend deployed successfully.
- Production unauthenticated job read returns HTTP 401.
- Client TypeScript passes.
- Server TypeScript and production build pass.
- Full release smoke suite passes, including production Coach.
- Supabase security advisors were run after the migration. Existing unrelated warnings were noted; this migration introduced no new table or policy.

## Verification still required

- Generate one authenticated Coach background job after deployment.
- Confirm server timing fields populate on the database row.
- After the next mobile build, confirm client polling/render fields merge into the same row.
- Accumulate enough jobs to calculate p50/p95 by language, attempts, fallback use, and outcome.

## Optimization decision rule

- High `queueMs`: improve job scheduling/worker capacity.
- High `openAiMs` with one attempt: reduce output size or evaluate a faster model against the quality matrix.
- High `attempts`, `retryMs`, or fallback use: tighten structured output and validation compatibility.
- High `databaseSaveMs`: inspect database/network placement and row payload size.
- High `clientPollingMs` beyond server processing: shorten polling interval carefully or use push/realtime completion.
- High `responseToRenderMs`: profile state persistence and Plan/Trainer rendering.

No model or output-quality change should be made until this breakdown has a representative sample.


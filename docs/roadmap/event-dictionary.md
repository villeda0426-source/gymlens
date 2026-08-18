# SpotLift Product Event Dictionary

Status: specification ready; implementation verification pending  
Privacy rule: never send workout notes, chat text, images, email addresses, names, pain descriptions, or generated plan content as analytics properties.

## Required common properties

Attach these automatically when technically available:

| Property | Example | Purpose |
|---|---|---|
| `event_id` | UUID | Deduplication |
| `occurred_at` | ISO timestamp | Funnel ordering |
| `anonymous_id` | Random install ID | Pre-auth journey |
| `user_id` | Supabase UUID | Authenticated journey; internal only |
| `platform` | `ios` | Segmentation |
| `app_version` | `1.0.7` | Release comparison |
| `build_number` | `43` | Release diagnosis |
| `locale` | `en` or `es` | Language quality |
| `session_id` | Random session UUID | Journey grouping |
| `source` | `instagram`, `organic`, `unknown` | Attribution |
| `campaign` | Stable slug | Attribution |
| `creative` | Stable slug | Creative learning |

## Activation events

| Event | Trigger | Allowed properties | Success use |
|---|---|---|---|
| `app_opened` | App becomes usable in a new session | launch type | Funnel denominator |
| `auth_started` | User initiates email/Apple authentication | method, mode | Login friction |
| `auth_succeeded` | Valid session established | method | Account conversion |
| `auth_failed` | Authentication attempt fails | method, normalized error class | Reliability; no raw error text |
| `equipment_discovery_started` | Scan or search begins | method | Equipment funnel |
| `equipment_result_viewed` | Useful equipment detail opens | method, cached boolean | First useful result |
| `equipment_discovery_failed` | No usable result | method, normalized error class | Reliability |
| `tutorial_opened` | User opens tutorial/safety/muscles/video area | tutorial type | Education value |
| `youtube_video_opened` | User opens a retrieved YouTube tutorial | equipment ID or slug | Video usefulness |
| `plan_requested` | User submits enough Coach intake to request a plan | days/week, units; no prompt text | Coach funnel |
| `plan_created` | Validated plan is saved | session count, timeline weeks | Plan success |
| `plan_failed` | No plan is saved | normalized error class | Coach reliability |
| `plan_viewed` | User opens a saved plan | thread ID hash, plan age bucket | Plan acceptance proxy |
| `workout_started` | User opens/starts a plan session | workout position, week number | Activation |
| `exercise_completed` | Exercise completion becomes saved | exercise category; no health notes | Workout progress |
| `workout_completed` | All required exercises in a workout are complete | week number, completion ratio | First workout value |
| `week_checkpoint_viewed` | Weekly feedback checkpoint appears | week number | Adaptation loop |
| `plan_completion_feedback_started` | Full-plan feedback appears | timeline weeks | Feedback-loop reliability |
| `plan_completion_feedback_submitted` | Structured feedback saves | rating buckets only; no note text | Adaptation input |
| `next_plan_created` | Replacement/adapted plan saves successfully | decision source, number of changes | North-star outcome |
| `next_recommendation_viewed` | User sees the saved next-plan explanation | decision source | North-star completion |
| `coach_thread_reopened` | User reopens plan-linked conversation | thread age bucket | Continuity |
| `account_deleted` | Server confirms deletion | platform/build only | Compliance health |

## Reliability and cost events

Prefer server-generated records for these outcomes so app termination cannot hide failures.

| Event | Producer | Required fields |
|---|---|---|
| `api_request_result` | Server | route class, status class, latency bucket, build |
| `coach_request_result` | Server | operation, success, error class, latency, model |
| `ai_usage_event` | Server | feature, model, token counts, latency, success |
| `youtube_request_result` | Server | success, quota/error class, latency |
| `deletion_result` | Server | success, normalized failure stage |

## Error taxonomy

Use stable classes; never send full provider or user-facing error messages.

- `network`
- `timeout`
- `authentication`
- `rate_limit`
- `validation`
- `database`
- `openai_configuration`
- `openai_provider`
- `youtube_configuration`
- `youtube_provider`
- `app_version`
- `unknown`

## Funnel definitions

### First useful result

`equipment_result_viewed` or `plan_created`, whichever happens first after `app_opened`.

### First-workout activation

A user with a first `app_opened` event completes `workout_completed` within 72 hours.

### North-star activation

A user completes all of the following within 72 hours of first open:

1. `plan_created`
2. `workout_completed`
3. `next_recommendation_viewed`

### Coach continuity success

`next_plan_created` divided by eligible `plan_completion_feedback_submitted` events.

## Verification checklist

- Events appear once, not once per render.
- Event order matches the real device journey.
- Retried API requests do not create duplicate success events.
- Anonymous and authenticated activity can be associated without exposing email.
- English and Spanish flows use the same event names.
- Build 43 is distinguishable from earlier builds.
- Raw prompts, notes, images, plan content, and health details are absent.
- Deleting an account removes user-linked product events according to the final retention policy.

## Implementation order

1. Create the privacy-safe event storage/API contract.
2. Add automatic common context and anonymous/session IDs.
3. Instrument authentication and first app open.
4. Instrument equipment discovery and useful-result views.
5. Instrument plan request/create/failure.
6. Instrument workout and feedback-loop outcomes.
7. Add baseline queries and reconcile counts against App Store Connect.
8. Verify one complete TestFlight/production journey before using metrics for decisions.

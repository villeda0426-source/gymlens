# SpotLift 1.0.7 Build 44 — Complete Update Record

## Release State

- Public iOS version: 1.0.7
- App Store build: 44
- Bundle identifier: `com.coachlift.app`
- Status: available on the App Store

## Product Experience

- Removed duplicate week/day labeling from the Plan view.
- Fixed the Plan tab freeze and restored scrolling and touch interaction.
- Restored exercise and warm-up detail cards with muscles worked, tutorials, safety guidance, and YouTube videos.
- Removed avatar shortcuts from Home and Plan.
- Simplified Profile while retaining display name, language, logout, and account management.
- Added complete in-app account deletion and associated-data cleanup.
- Expanded Spanish coverage across the complete core product experience.

## Coach and Feedback Loop

- Added weekly checkpoints instead of interrupting after every workout day.
- Added an immediate completion flow after the last workout of the full plan.
- Full-plan feedback now starts the next progression-plan workflow.
- Saved Coach conversations are linked to their corresponding workout plans.
- Plan follow-up returns users to the correct Coach conversation.
- Preserved the original Coach Trainer instruction layer.
- Production flow: profile, goals, and history → Coach instructions → OpenAI → validated plan JSON → database save → SpotLift display.

## AI Architecture

- Consolidated AI reasoning, vision, equipment identification, load estimation, and Coach generation on the OpenAI Responses API.
- Removed Claude and Gemini as runtime AI dependencies.
- Kept the YouTube Data API for tutorial search and video metadata.
- Uses schema validation, JSON repair, guardrails, and a selected fallback model path.
- Uses deterministic progression rules for routine feedback to control cost and reserve model calls for higher-judgment cases.

## Reliability and Security

- Coach intake uses authenticated background jobs.
- Coach job reads are restricted by job ID and user ID.
- Failed prompts are preserved for resubmission.
- Added dependency health, request IDs, release smoke checks, and a reliability runbook.
- Kept backend route compatibility for active mobile releases.
- Sentry and Vexo integrations remain in the client.

## Quality Evidence

- Controlled plan baseline: 20/20 scenarios passed across English and Spanish.
- Complete-plan adaptation baseline: 4/4 passed.
- Safety baseline: 16/16 high-risk scenarios passed across English and Spanish.
- Authenticated production verification passed for job ownership, timing persistence, feedback persistence, review readback, and account deletion.
- Founder field test completed workout updates and changes without reported issues.

## Latency Evidence

Coach instrumentation separates queue time, OpenAI time, validation and retry time, database save time, job-start time, polling time, render time, attempts, and fallback use. In the authenticated production sample, OpenAI accounted for most server processing time. At least 30 successful jobs are required before changing model or polling strategy based on p50/p95 data.

## App Review Corrections

- Replaced pressuring camera pre-permission wording with neutral continuation language.
- Added appropriate denied-permission guidance and a Settings path.
- Corrected Sign in with Apple configuration, entitlement, Supabase provider setup, identity-token handling, nonce handling, and user-facing error behavior.
- Prepared login for clean-install, update-path, and supported-iPad review testing.
- Included in-app account deletion and associated-data cleanup.

## Product and Growth Foundation

- Defined the north star: a new user completes a personalized workout and receives or saves the next recommendation within 72 hours.
- Added the operating roadmap, event dictionary, weekly scorecard, validation sprint, decision log, Coach tests, and device checklist.
- Added the Road to 10,000 plan, AI-assisted marketing system, video-source blueprint, and pitch-competition materials.

## Post-Release Workspace Work

The current workspace also contains Android versionCode 6, Android-beta web pages and calls to action, Expo patch-level dependency updates, and newer marketing, pitch, asset, output, and Reddit operations work. These items are included in the local source snapshot but are not automatically part of the shipped iOS build.

## Next Priorities

- Accumulate at least 30 successful Coach jobs before optimizing latency.
- Complete human expert review of workout prescriptions.
- Continue English and Spanish physical-device journey testing.
- Verify the activation and retention funnel end to end.
- Maintain backend compatibility for at least two active public mobile releases.
- Complete Google Play and Android release work separately.

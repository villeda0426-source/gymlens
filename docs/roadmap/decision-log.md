# SpotLift Decision and Learning Log

Use this file for consequential decisions. A decision can be revised, but the original reasoning should remain visible.

## Decision template

### YYYY-MM-DD — Decision title

- Status: proposed / accepted / reversed
- Decision:
- Evidence:
- Assumptions:
- Alternatives considered:
- Expected effect:
- Measurement date:
- Result:
- Follow-up:

## Active decisions

### 2026-08-17 — Use one primary AI reasoning platform

- Status: accepted
- Decision: use OpenAI for AI reasoning, image understanding, structured workout-plan generation, and Coach interactions. Keep tutorial-video retrieval on the YouTube API.
- Evidence: consolidating the model layer simplifies reliability, observability, and billing. YouTube remains the authoritative integration for YouTube search and video metadata.
- Assumptions: OpenAI quality remains sufficient for the validated coaching schema; YouTube API availability and quota remain acceptable.
- Alternatives considered: Claude, Gemini, or a multi-provider runtime.
- Expected effect: fewer provider-specific failure paths and clearer AI unit economics.
- Measurement date: weekly during the validation sprint.
- Result: pending baseline.
- Follow-up: measure cost and success rate separately by feature; do not add provider failover without evidence.

### 2026-08-17 — Optimize for complete activation before paid growth

- Status: accepted
- Decision: prioritize the full first-workout-to-next-recommendation journey before materially increasing paid acquisition.
- Evidence: historical App Store volume is too small for reliable retention conclusions, and the product-event funnel has not yet been verified end to end.
- Assumptions: activation improvements will increase the value of every future install.
- Alternatives considered: increase advertising immediately or add subscriptions immediately.
- Expected effect: lower wasted acquisition spend and clearer product-market evidence.
- Measurement date: after two clean baseline weeks.
- Result: pending.
- Follow-up: revisit only when attribution and activation are measurable.

### 2026-08-17 — Define the north star around user value, not AI output

- Status: accepted
- Decision: count success when a new user completes a personalized workout and sees or saves the next recommendation within 72 hours.
- Evidence: a generated plan alone does not prove that the app helped someone train or return.
- Assumptions: the next recommendation is a meaningful indicator of coaching continuity.
- Alternatives considered: downloads, account registrations, scans, chats, or plans generated.
- Expected effect: product work remains focused on useful behavior and retention.
- Measurement date: first two weeks with verified events.
- Result: pending.
- Follow-up: refine the threshold after a clean baseline without changing historical definitions silently.

## Learning log

### 2026-08-17 — Current data gap

- Observation: Sentry and Vexo initialize in the client, and the server records privacy-limited AI usage, but a complete business-event funnel is not yet evident in the application code.
- Interpretation: downloads and crashes can be observed separately, but the team cannot yet explain where a user drops between plan creation and the next recommendation.
- Action: make event definition and verification the first post-release implementation priority.

### 2026-08-17 — App Store release state

- Observation: iOS 1.0.7 build 43 was built, uploaded, and submitted after addressing in-app account deletion.
- Interpretation: release work is waiting on Apple; active product time should move to measurement preparation without changing the submitted binary.
- Action: monitor review while preparing the validation sprint.

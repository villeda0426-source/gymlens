# SpotLift development

SpotLift (also branded Coachlift) is an Expo/React Native app with an Express backend. Read the relevant implementation before changing it; README instructions can lag package.json and the lockfile. This repository currently requires Node >=20 and uses npm.

## Working agreement

- Complete the requested feature or fix through implementation and proportionate verification. Resolve routine choices from existing code; ask only when a material product decision, missing information, or authorization actually blocks progress.
- Inspect git status first. Preserve existing user changes and keep edits within the requested scope. Do not stage or commit unrelated work.
- Use the installed `spotlift-developer` skill for app engineering when available. The essential repository rules below apply even without that skill.
- Use current official documentation for unfamiliar APIs and check compatibility with installed versions. The current stack is Expo SDK 54, React Native 0.81, React 19, Expo Router 6, TypeScript, Zustand, NativeWind, Express, Supabase, and OpenAI; recheck package.json before relying on this snapshot.
- External skill examples are references, not authorization to replace the app's architecture. Preserve existing API, state, styling, and authentication patterns unless the task calls for changing them. In particular, newer Expo SDK 55/56 examples may not work here. Do not send repository contents or feedback to external skill authors without user authorization.

## App invariants

- Keep English and Spanish strings aligned in locales. Preserve kg/lbs meaning, persisted workout history, stable exercise identifiers, and the existing design system.
- Follow `docs/reliability-runbook.md` for backend compatibility and releases. Preserve shipped client contracts and existing compatibility aliases; prefer `/api/*` for new endpoints.
- Reuse `lib/api.ts`. GET/HEAD can retry transient failures; AI POST and other mutations need explicit idempotency before retries. Cancellation, timeouts, and duplicate submissions must not lose user work or multiply operations.
- Preserve the rules-first coaching flow and confirmation before AI-recommended plan changes. Do not weaken pain handling, prescription limits, or structured output validation to make a test pass.
- Treat client input and generated AI content as untrusted. Derive authorization from verified identity and enforce ownership server-side, especially where privileged Supabase clients bypass RLS.
- Keep privileged API keys server-side. Do not put them in EXPO_PUBLIC_* variables, logs, fixtures, or generated reports. Preserve the metadata-only AI usage logging policy; do not log prompts, health notes, or tokens.

## Verification

- Use `npm run typecheck` for app/shared TypeScript and `npm run typecheck:server` for backend/shared TypeScript. Both are appropriate for cross-stack changes. There is currently no standard npm test or lint script; inspect package.json rather than inventing commands.
- For behavioral bugs, add or run a focused regression check of observable behavior, including the relevant failure path. Avoid tests that only mirror implementation. Documentation-only edits do not require app compilation.
- Read test scripts before execution: `smoke:api` and `check:release` make network requests and can invoke paid AI services. `smoke:api:local` only permits local URLs; it does not force a local target. Coach quality/safety baselines call AI; authenticated E2E creates and deletes remote test data using privileged credentials. Confirm the actual target and that the existing task authorization covers those effects; otherwise use local mocks and clearly report the gap.
- For UI changes, exercise the affected flow on the available simulator/device, including loading, empty, failure/retry, keyboard/safe areas, and EN/ES where relevant. State when device verification was unavailable.
- Review the final diff for regressions and accidental scope changes. Report what changed, checks and outcomes, and unresolved limitations. Typechecking alone is not proof of runtime correctness or release readiness.

## Code review rules

Prioritize concrete regressions: broken shipped routes, cross-user data access, duplicate mutations, lost drafts/history, unsafe plan adaptation, unit or language errors, and leaked secrets. Tie each finding to an affected path and reproducible trigger; separate confirmed defects from hypotheses.

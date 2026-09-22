# Codebase map

Snapshot inspected September 15, 2026. Resolve these paths relative to the active checkout and verify them again as the app changes.

| Concern | Starting points |
| --- | --- |
| Screens and navigation | `app/_layout.tsx`, `app/(tabs)/`, `app/(auth)/`, `app/auth/callback.tsx` |
| UI and translations | `components/`, `locales/`, `lib/i18n.ts`, existing screen styles |
| Equipment identification/search | `hooks/useEquipmentIdentify.ts`, `hooks/useEquipmentSearch.ts`, `store/equipmentStore.ts`, `server/routes/identify.ts`, `server/routes/search.ts` |
| Network behavior | `lib/api.ts`, `hooks/useApiHealth.ts`, `server/index.ts` |
| Auth and account deletion | `hooks/useAuth.ts`, `store/authStore.ts`, `lib/supabase.ts`, `lib/authRedirect.ts`, `server/routes/account.ts` |
| Coach state and persistence | `store/coachTrainerStore.ts`, `lib/coachTrainer.ts`, `server/routes/coach-trainer.ts` |
| Coaching rules and AI | `lib/coachingEngine.ts`, `lib/ai.ts`, `server/services/coachTrainerService.ts`, `server/services/openaiService.ts` |
| Database | `supabase/`; inspect actual schema/migrations and task-specific access policies |
| Reliability and releases | `docs/reliability-runbook.md`, `docs/roadmap/testflight-coach-device-checklist.md`, `app.json`, package scripts |

The static `coachlift-web/` website and `spotlift-reddit-ops/` operations project are distinct surfaces. Do not include them in an app fix unless relevant.

## Checks and effects

| Check | Use and boundary |
| --- | --- |
| `npm run typecheck` | Root TypeScript compilation; includes more than just mobile code because the root tsconfig has broad includes. No runtime coverage. |
| `npm run typecheck:server` | Backend compilation and imported shared modules. No runtime coverage. |
| `npm run build:server` | Builds into dist-server; appropriate for build/packaging changes. |
| `npm run check:app-review` | Inspect script first for its current file/network effects and required configuration. |
| `npm run smoke:api` | Requests configured services and AI endpoints. Reads .env and .env.local; the latter overrides environment-file values. |
| `npm run smoke:api:local` | Allows localhost, but still uses configured API_BASE/EXPO_PUBLIC_API_BASE_URL. Not isolation. |
| `npm run check:release` | Both typechecks then remote smoke; not an offline general test command. |
| `scripts/coach-quality-baseline.ts` / `scripts/coach-safety-baseline.ts` | AI-backed scenarios, including EN/ES. Inspect execution, spend, output locations, and current fixtures before running. |
| `scripts/coach-authenticated-e2e.ts` | Privileged remote test user creation/deletion and API mutations. Confirm target and cleanup behavior before use. |

The first draft changed instructions only and did not run the app, remote tests, or deployments. Never carry that draft status forward as proof that a later code change passed.

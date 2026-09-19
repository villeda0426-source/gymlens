# SpotLift Reliability Runbook

Use this before every App Store submission and after every backend deploy.

## Reliability Rules

- Keep every shipped mobile route supported on the backend until that app version is no longer active.
- Prefer `/api/*` routes for all new app calls.
- Never remove or rename a backend endpoint without adding a compatibility alias first.
- AI features must fail gracefully with a useful message or a local fallback.
- GET/HEAD requests may retry transient errors. AI POST requests should not retry automatically unless the route is explicitly idempotent.

## AI Provider Map

- Coach and equipment identification use Claude through `ANTHROPIC_API_KEY`.
- Workout guide search uses OpenAI through `OPENAI_API_KEY` and `OPENAI_WORKOUT_MODEL`.
- Catalog equipment search uses Supabase and does not call an AI provider.
- No shipped runtime path requires Gemini.
- Workout search makes one OpenAI request with a 25-second server timeout and no SDK retries,
  leaving time to return its fallback before the shipped client's 30-second deadline.
- Equipment scans use a 10-second quick-name call and, on cache miss, one 35-second
  full-identification call. Claude SDK retries are disabled so a provider incident
  cannot silently multiply latency or cost.

Rollback a provider migration by reverting its application commit and redeploying
the previous known-good commit. Keep both required keys in Railway during rollback
so the unaffected provider paths remain available.

## Release Gate

1. Confirm production API env vars are set:
   - `EXPO_PUBLIC_API_BASE_URL`
   - `API_BASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
2. Run:

   ```bash
   npm run typecheck
   npm run typecheck:server
   npm run smoke:api
   ```

3. Confirm the smoke test covers:
   - `/health`
   - `/api/dependency-health`
   - `/api/search`
   - `/api/videos`
   - `/api/workout-search`
   - legacy `/workout-search`
   - `/api/coach-trainer`
4. Open the installed TestFlight/App Store build and manually test:
   - search equipment
   - tap a search result and go back
   - scan a photo
   - workout guide search
   - trainer chat or plan generation
   - saved equipment
   - login/logout

## Incident Checklist

When a user reports a 404, 500, timeout, or "service unavailable":

1. Run `npm run smoke:api`.
2. Check `https://gymlens-production.up.railway.app/api/dependency-health`.
3. Check Railway logs for the route, status, and request ID.
4. Confirm the App Store build number and route it is calling.
5. If the app calls an old route, add a backend compatibility alias first, then update the app to the canonical route.
6. If an AI provider fails, keep cached/catalog features usable and return a friendly fallback message.

## Backend Compatibility Policy

Maintain compatibility aliases for at least two public mobile releases. Current known aliases:

- `POST /workout-search` -> `POST /api/workout-search`

Before deleting an alias, confirm the minimum supported app build no longer calls it.

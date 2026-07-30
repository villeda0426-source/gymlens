# SpotLift Reliability Runbook

Use this before every App Store submission and after every backend deploy.

## Reliability Rules

- Keep every shipped mobile route supported on the backend until that app version is no longer active.
- Prefer `/api/*` routes for all new app calls.
- Never remove or rename a backend endpoint without adding a compatibility alias first.
- AI features must fail gracefully with a useful message or a local fallback.
- GET/HEAD requests may retry transient errors. AI POST requests should not retry automatically unless the route is explicitly idempotent.

## Release Gate

1. Confirm production API env vars are set:
   - `EXPO_PUBLIC_API_BASE_URL`
   - `API_BASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
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

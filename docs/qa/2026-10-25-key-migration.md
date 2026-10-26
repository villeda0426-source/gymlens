# Key migration and iOS build 49

Date: 2026-10-25 (America/Chicago). Agent: Codex GPT-6.
Checkout: `/Users/villedajr/SpotLift`, `release/next`, starting HEAD
`fefe19ecee721a658597e9c76c659b23ccbeca86`. Clean initially; migration
changes remain uncommitted. No private credential values are recorded here.

## Verified

- Railway project `capable-love`, service `gymlens`, production deployment
  `f7247d51-fda6-4931-a832-bbecaf8c42c9` is successful. `/health` and
  `/api/dependency-health` returned 200, including Supabase connectivity.
  Startup appeared in the available deployment log sample; no authentication
  errors appeared in that sample (two entries, not an exhaustive audit).
- Railway still uses a legacy JWT `SUPABASE_SERVICE_ROLE_KEY`. Five private
  credentials in the requested rotation are present. Their values were neither
  printed nor changed during this stage.
- Current Gmail SMTP authentication and YouTube API authentication passed.
  No email was sent. These are baseline checks, not evidence of rotation.
- Supabase dashboard already has a publishable key. Configured it in ignored
  local `.env` and EAS production as `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  Local scripts also have `SUPABASE_PUBLISHABLE_KEY`. Existing private values
  and legacy keys were preserved.
- App and supporting scripts now prefer the publishable key with legacy
  fallback. EAS production explicitly selects the production environment.
- `npm run typecheck`, `npm run typecheck:server`, and
  `npm run check:app-review` passed. The latter reached production Supabase
  using the publishable key.
- `npm run test:app`: 94 passed. `npm run test:server`: 19 passed, one
  opt-in live test skipped. Separately ran that live test successfully:
  `TS_NODE_PROJECT=server/tsconfig.json CATALOG_LIVE=1 node --env-file=.env --require ts-node/register --test server/__tests__/equipmentCatalog.live.test.ts`.
- Fixed app type-check inclusion of the separate ignored
  `spotlift-reddit-ops/` project. Its missing Cloudflare types caused the
  initial type-check failure. The live test's first direct invocation also
  failed because it omitted `TS_NODE_PROJECT`; the corrected command passed.
- `git diff --check` passed.

## Build

iOS 1.0.8 build 49 uploaded to EAS, using existing signing credentials with
`--freeze-credentials`. Build id: `1394b9cd-36c4-4fb0-a1e9-a33c12cfdc7f`.
Final EAS state: `FINISHED`, completed at 2026-10-25 20:04 CDT.
This confirms the build succeeded, not a TestFlight/App Store release or
device-flow validation. No store submission was requested by the build command.

Build URL: https://expo.dev/accounts/affilm426/projects/coachlift/builds/1394b9cd-36c4-4fb0-a1e9-a33c12cfdc7f

## Outstanding

1. OpenAI replacement-key setup and production deployment are complete; old
   key retirement remains pending.
2. Create a replacement Supabase secret key and set Railway's
   `SUPABASE_SERVICE_ROLE_KEY`; update local `.env` too.
3. Rotate `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, and `GMAIL_APP_PASSWORD`.
   No Anthropic runtime usage was found in the current app/server source;
   do not interpret that as permission to ignore an exposed credential.
4. Update matching local values as necessary, including overrides in
   `.env.local`, so local scripts do not continue using retired credentials.
5. Deploy once the remaining new production values are set. Confirm actual deployment
   success, database access, AI identification and authenticated plan generation,
   YouTube access, and Gmail SMTP authentication. Only then retire replaced
   private keys as appropriate.
6. Verify build 49 completes and test its sign-in and primary app flows before
   release. Keep legacy Supabase API keys enabled while older installed apps
   require them. An EAS build alone does not migrate existing installations.

Private comparison metadata (SHA-256 hashes only) is saved locally at
`output/security-rotation-2026-10-25/baseline.json`, excluded from Git. Compare
new Railway values to it before claiming all five rotations are complete.

Browser credential changes require a user handoff under the computer-use
policy. OpenAI has a dedicated secure connector flow. Do not request keys in
chat or print raw Railway variable listings.

## OpenAI rotation follow-up

- The user selected the Personal organization / Default project in the secure
  widget and explicitly confirmed `.env.local` as the destination.
- Created a replacement key named `Codex` with no expiration requested, wrote
  it securely to ignored `.env.local`, and verified access to both configured
  model families (`gpt-5-mini`, `gpt-5-nano`). A minimal live response using
  `gpt-5-mini` completed successfully.
- Applied `OPENAI_API_KEY` to Railway production using stdin, verified the
  stored value matches without printing it, and started redeployment
  `0fd85f55-a3da-4915-8767-1b58f575c3d8`. Final state: `SUCCESS`.
- The old OpenAI key has not been revoked. Remaining four private-key
  rotations are still pending.
- Public vision-test fixture: [Dumbbells on rack 20180112](https://commons.wikimedia.org/wiki/File:Dumbbells_on_rack_20180112.jpg)
  by Santeri Viinamäki, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  Unmodified Wikimedia thumbnail downloaded to the ignored local output folder
  solely for the identification verification; no user photo was used.

### Verification after OpenAI replacement deployment

- `npm run smoke:api`: all eight checks passed, covering health, dependency
  health, equipment search, videos, current and legacy workout-guide routes,
  and trainer chat.
- Live `/api/identify` request with the public fixture returned HTTP 200,
  `Dumbbell Rack` / `Soporte de Mancuernas`, catalog type match, and bilingual
  instructions. The observation was photo-based; catalog content was reused.
  This is one fixture, not general identification-accuracy evidence.
- `TS_NODE_PROJECT=server/tsconfig.json node --require ts-node/register scripts/coach-authenticated-e2e.ts`
  passed authenticated plan creation, timing persistence, workout-feedback
  persistence/readback, and temporary-account deletion. One generation attempt,
  no fallback; OpenAI processing took about 24.5 seconds. The temporary user
  was cleaned up successfully.
- New deployment log sample: five entries, no detected credential/quota errors.
- Compared production credentials with the saved baseline: only
  `OPENAI_API_KEY` changed. Supabase, Anthropic, YouTube, and Gmail remain
  unchanged. Old-key revocation has not been performed for any provider.

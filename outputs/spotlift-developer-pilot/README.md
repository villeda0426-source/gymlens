# useEquipmentSearch overlapping-request pilot

Isolated, offline regression pilot. It does **not** import, execute, or modify
any SpotLift application code. It runs a verbatim copy of the hook against a
controllable fake request layer so completion order is explicit rather than
timing-dependent.

## Subject

- Repository root: `/Users/villedajr/SpotLift`
- Branch: `main`
- HEAD: `351c4d6b80bbe1dfbdf8f80775e9e661da2103fd`
- Subject file: `hooks/useEquipmentSearch.ts`
  (sha256 `66d7e4a828b9c1036e5107f244c62b9ca1bb86693b4dae36c119fa924804a6e5`,
  recorded in `baseline.json` and re-verified after the run)

## Layout

| Path | Purpose |
|---|---|
| `harness/hooks-runtime.ts` | ~90-line synchronous `useState`/`useRef`/`useCallback` runtime |
| `harness/fake-api.ts` | Deferred stand-in for `apiFetch`; test drives settle order |
| `src/useEquipmentSearch.before.ts` | Verbatim copy of the shipped hook |
| `src/useEquipmentSearch.after.ts` | Candidate fix (request-id guard) |
| `run-regression.ts` | 3 race scenarios + 4 controls, run against both variants |
| `tsconfig.json` | Pilot-local config; uses the repo's installed `ts-node`/`typescript` |

## Run

```bash
cd /Users/villedajr/SpotLift
node_modules/.bin/ts-node --project outputs/spotlift-developer-pilot/tsconfig.json \
  outputs/spotlift-developer-pilot/run-regression.ts
```

Exit code 0 means: all three race scenarios failed on `before`, and all seven
scenarios passed on `after`. Either half not holding is a failure.

## Limitations

- The hooks runtime is a behavioural model, not React. It does not model
  batching, concurrent rendering, StrictMode double-invocation, Suspense, or
  unmount. It is adequate for "which async continuation writes state last",
  which is the entire question here, and nothing beyond that.
- `apiFetch` is faked. The real `lib/api.ts` GET retry ladder (350 ms / 900 ms
  on 408/429/5xx) and 12 s timeout are not exercised; they widen the race
  window in production but are not required to reproduce it.
- No device, simulator, or network verification was performed.
- The fix lives only in this pilot copy. `hooks/useEquipmentSearch.ts` is
  unchanged.

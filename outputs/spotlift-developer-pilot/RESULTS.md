# Result: three stale-state races confirmed in useEquipmentSearch

Date: 2026-09-15 · Evidence status: **verified in an isolated pilot** (not on device)

## Repository identity at test time

| Field | Value |
|---|---|
| Root | `/Users/villedajr/SpotLift` |
| Branch | `main` |
| HEAD | `351c4d6b80bbe1dfbdf8f80775e9e661da2103fd` |
| Dirty state | 8 modified tracked files, 13 untracked paths — all pre-existing, none touched by this task |

`git status --porcelain` produced the same 21 entries before and after the run.
`hooks/useEquipmentSearch.ts`, `package.json`, and `package-lock.json` sha256
values matched `baseline.json` after the run.

## Defect

`hooks/useEquipmentSearch.ts` has no request sequencing. `search()` writes
`results`, `error`, and `isLoading` from an async continuation without checking
whether it is still the newest call, so a slower earlier request publishes over
a newer one.

Real trigger path: `app/(tabs)/search.tsx` debounces keystrokes by 300 ms
(line 44-47) and also calls `search()` directly from a button press (line 150).
Neither prevents overlap — the debounce only spaces request *starts*; nothing
orders their *completions*. `lib/api.ts` widens the window: GETs retry twice
(350 ms, 900 ms) on 408/429/5xx with a 12 s timeout, so one slow attempt can
easily outlive a subsequent fast one.

Three distinct failures, each independently reproduced:

| # | Failure | User-visible effect |
|---|---|---|
| 1 | Stale **success** overwrites newer results (line 20) | Typing "bench" shows results for "ben" |
| 2 | Stale **error** overwrites newer results (lines 22-23) | A successful search is replaced by an error screen and an empty list |
| 3 | Stale **completion** clears loading (line 25) | Spinner stops while the newest search is still in flight; empty state flashes |

## Fix under test

A monotonic request id in a `useRef`, captured per call, gating all three state
writes. `src/useEquipmentSearch.after.ts`. ~6 added lines, no dependency, no API
or contract change, no behaviour change for the single-request path.

Deliberately **not** included: passing an `AbortSignal` into `apiFetch`.
`lib/api.ts:103` resolves `const signal = init.signal ?? controller.signal`, so
supplying a caller signal replaces the internal timeout controller and the
`timeoutMs` abort silently stops taking effect. See "Related finding" below.

## Exact commands and results

```
$ cd /Users/villedajr/SpotLift
$ node_modules/.bin/ts-node --project outputs/spotlift-developer-pilot/tsconfig.json \
    outputs/spotlift-developer-pilot/run-regression.ts
```

```
=== BEFORE (current hooks/useEquipmentSearch.ts) ===
  FAIL  [race] stale success must not overwrite newer results
          - results: expected [Bench Press], got [Bent-Over Row]
  FAIL  [race] stale error must not overwrite newer results
          - results: expected [Bench Press], got []
          - error: expected null, got "Network request failed"
  FAIL  [race] stale completion must not clear the spinner while newer search runs
          - isLoading while newer request pending: expected true, got false
          - results before newer request lands: expected [], got [Bent-Over Row]
  PASS  [control] single search publishes results and clears loading
  PASS  [control] single failed search surfaces the error
  PASS  [control] sequential searches keep the newest result
  PASS  [control] retrying after a failure recovers

=== AFTER  (request-id guarded copy) ===
  PASS (all 7)

  BEFORE: 4 passed, 3 failed
  AFTER:  7 passed, 0 failed
  Race scenarios failing BEFORE: 3/3 (expected 3/3)
  Scenarios failing AFTER: 0/7 (expected 0)
  RESULT: regression demonstrated and fixed
```
Exit code 0.

Copy fidelity — the `before` hook body is byte-identical to the shipped file
after indentation normalisation:

```
$ sed -n '/const \[results/,/^  return { search/p' hooks/useEquipmentSearch.ts | sed 's/^  *//' > /tmp/real.txt
$ sed -n '/const \[results/,/^    return { search/p' outputs/spotlift-developer-pilot/src/useEquipmentSearch.before.ts | sed 's/^  *//' > /tmp/copy.txt
$ diff /tmp/real.txt /tmp/copy.txt    # no output
```

Typecheck:

```
$ node_modules/.bin/tsc --noEmit -p outputs/spotlift-developer-pilot/tsconfig.json   # 0 errors
$ npm run typecheck                                                                  # 4 errors
```

The 4 `npm run typecheck` errors are all in `spotlift-reddit-ops/` (missing
`cloudflare:workers`, `Fetcher`, `D1Database` types) — an untracked separate
sub-project with file mtimes from 2026-08-26/27, pre-dating this session.
Zero errors reference `outputs/spotlift-developer-pilot`. `npm run typecheck`
picks up the pilot because the root tsconfig includes `**/*.ts`.

## Related finding (reported, not fixed)

`lib/api.ts:100-110` — the abort controller created for the timeout is only
honoured when the caller passes no `signal`. Any caller that supplies its own
`init.signal` for cancellation silently loses timeout enforcement, because the
`setTimeout(() => controller.abort())` then aborts a controller no fetch is
listening to. Not in this task's scope; worth a separate look before anyone
adds caller-side cancellation.

## Limitations

- Isolated pilot only. The fix is **not** applied to `hooks/useEquipmentSearch.ts`.
- The hooks runtime models state-write ordering, not React (no batching,
  concurrent rendering, StrictMode, or unmount).
- `apiFetch` is faked; the real retry ladder and timeout were not executed.
- No simulator, device, EN/ES, or network verification. Typecheck is not runtime
  verification.
- The hook also has no unmount guard, so it writes state after the screen is
  gone. Out of scope here; the request-id guard does not address it.

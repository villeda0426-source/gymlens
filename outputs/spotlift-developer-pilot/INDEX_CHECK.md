# Index retrieval acceptance check

Date: 2026-09-15 · Mode: read-only (no app edits, no remote calls, no agent messages)
Method: files read from disk; every claim below re-derived from the current
checkout, not from conversation recall.

## 1. Index read and links resolved

Source: `/Users/villedajr/.buzz/GUIDES/SPOTLIFT_DEVELOPER_INDEX.md`
(frontmatter `status: active`, `created: 2026-09-15`). It lists two records.

| Link as written | Resolves to | Exists | Size |
|---|---|---|---|
| `SPOTLIFT_HOOK_RACE_PILOT.md` | `/Users/villedajr/.buzz/GUIDES/SPOTLIFT_HOOK_RACE_PILOT.md` | yes | 3420 B |
| `../WORK_LOGS/2026_09_15_SPOTLIFT_EQUIPMENT_SEARCH_RACE_PILOT.md` | `/Users/villedajr/.buzz/WORK_LOGS/2026_09_15_SPOTLIFT_EQUIPMENT_SEARCH_RACE_PILOT.md` | yes | 4341 B |

Both relative links resolve correctly from `GUIDES/`. No dangling links. Every
artifact path cited inside the two records also exists:

```
outputs/spotlift-developer-pilot/baseline.json                    EXISTS
outputs/spotlift-developer-pilot/run-regression.ts                EXISTS
outputs/spotlift-developer-pilot/tsconfig.json                    EXISTS
outputs/spotlift-developer-pilot/src/useEquipmentSearch.after.ts  EXISTS
outputs/spotlift-developer-pilot/src/useEquipmentSearch.before.ts EXISTS
outputs/spotlift-developer-pilot/harness/hooks-runtime.ts         EXISTS
outputs/spotlift-developer-pilot/harness/fake-api.ts              EXISTS
outputs/spotlift-developer-pilot/README.md                        EXISTS
outputs/spotlift-developer-pilot/RESULTS.md                       EXISTS
```

The guide and the work log cross-reference each other; both directions resolve.

## 2. Recorded identity vs current checkout — all match

| Field | Recorded in index / work log | Current checkout | Match |
|---|---|---|---|
| Root | `/Users/villedajr/SpotLift` | `/Users/villedajr/SpotLift` | yes |
| Branch | `main` | `main` | yes |
| HEAD | `351c4d6b80bbe1dfbdf8f80775e9e661da2103fd` | `351c4d6b80bbe1dfbdf8f80775e9e661da2103fd` | yes |
| `git status --porcelain` entries | 21 | 21 | yes |
| `hooks/useEquipmentSearch.ts` sha256 | `66d7e4a8…04a6e5` | `66d7e4a8…04a6e5` | yes |

`baseline.json` also pins `package.json` (`60730f80…2d974d5e`) and
`package-lock.json` (`eab9ad47…8014b90e`); both still match. The records are
therefore current for this checkout — no re-verification against a moved HEAD is
needed yet.

Cited line numbers re-checked against current source and all still correct:

- `lib/api.ts:103` → `const signal = init.signal ?? controller.signal;`
- `app/(tabs)/search.tsx:44-47` → 300 ms debounce calling `search(query, activeCategory)`
- `app/(tabs)/search.tsx:150` → `onPress={() => search(query, activeCategory)}`
- `hooks/useEquipmentSearch.ts:20 / 22-23 / 25` → `setResults(data || [])` / `setError(...)`+`setResults([])` / `setIsLoading(false)`
- root `tsconfig.json:13` → `"**/*.ts"` in `include`
- `package.json` → no `test` script; no jest, vitest, or react-test-renderer

## 3. Saved lesson

**Work log** (`WORK_LOGS/2026_09_15_…`): `useEquipmentSearch` has no request
sequencing, so an older in-flight search can publish over a newer one in three
independent ways — stale success (line 20), stale error (lines 22-23), and stale
completion clearing the spinner (line 25). The debounce in `search.tsx` spaces
request *starts* but never orders *completions*, and `lib/api.ts`'s GET retry
ladder widens the window. A monotonic request id held in a `useRef` and checked
before each state write fixes all three: 3/3 race scenarios failed before, 7/7
scenarios passed after.

**Guide** (`GUIDES/SPOTLIFT_HOOK_RACE_PILOT.md`): the reusable technique. This
repo has no test runner, so async hook ordering is tested offline with a small
synchronous hooks runtime plus a deferred fake request layer that lets the test
choose settle order. Assert in *both* directions — race scenarios must fail on
the unfixed copy and pass on the fixed one — or the suite has not shown the bug
exists. Two documented traps: the root tsconfig's `**/*.ts` include means any
file written inside the repo lands in `npm run typecheck`; and do not fix a hook
race by passing an `AbortSignal` into `apiFetch` without reading `lib/api.ts:103`
first.

## 4. Was any production fix applied? — No

`hooks/useEquipmentSearch.ts` is byte-identical to its recorded baseline hash.
Grep for `latestRequestIdRef`, `requestId`, and `useRef` in that file returns
nothing; the file still imports only `useState, useCallback`. The guard appears
6 times in `src/useEquipmentSearch.after.ts`, the pilot copy, and nowhere in app
source. Nothing was staged, committed, merged, pushed, or deployed. The index's
"Open items" statement that the fix is not applied is accurate as of this check.

## 5. What remains unverified

Carried forward from the records, still true:

- The fix has never run in React. The pilot's hooks runtime models state-write
  ordering only — no batching, concurrent rendering, StrictMode, Suspense, or
  unmount.
- `apiFetch` was faked; the real retry ladder and 12 s timeout were never
  executed against the hook.
- No simulator, device, EN/ES, or network verification of the search screen.
  Typecheck is not runtime verification.
- The `lib/api.ts:103` signal/timeout interaction is confirmed by reading the
  code — the line is still exactly as recorded — but has not been executed.
- The hook still has no unmount guard; it writes state after the screen is gone.
  Out of scope for the request-id fix.
- Evidence strength is one run on one day at one HEAD. That is not a reliability
  claim.

## Conclusion

Index retrieval succeeded. Both linked records exist, resolve, and are internally
consistent; every recorded hash, HEAD, branch, dirty-state count, and cited line
number still matches the live checkout. No production fix was applied — the
candidate change remains confined to the pilot copy.

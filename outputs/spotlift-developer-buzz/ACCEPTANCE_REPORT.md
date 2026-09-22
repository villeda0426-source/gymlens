# SpotLift Developer — Buzz acceptance

Completed 2026-09-15 (America/Chicago).

## Available in Buzz

**Agents → SpotLift Developer**, also available in direct messages. Created and observed Online; completed both the coding pilot and the index retrieval task. Profile controls include Message, Stop, Restart, Edit, Export, and Memories. Workflow version 0.2.0 with local deployment instructions. Uses Buzz's existing Claude Code harness defaults, no pinned model, parallelism 1.

`DEPLOYMENT.json` records identity, instruction hash, and snapshot checksum. `spotlift-developer.agent.png` is a genuine Buzz Desktop export; its `buzz_agent_snapshot` metadata parses and its system prompt exactly matches `docs/agents/spotlift-developer/BUZZ_AGENT_INSTRUCTIONS.md`. No round-trip import was performed to avoid creating a duplicate agent. Preserve the installed skill and Nest guide/work-log files separately when moving hosts.

## Coding test

The live agent used `/Users/villedajr/SpotLift`, branch `main`, HEAD `351c4d6b80bbe1dfbdf8f80775e9e661da2103fd` and an isolated copied hook with fake requests. Three stale-state search races reproduced. Before: 4 controls passed, 3 race checks failed. After: 7 passed, 0 failed. Independent rerun matched; isolated TypeScript compilation passed.

Review tightened the runner's exit condition so a failing BEFORE control also fails the overall test; rerun passed. The source hook, package.json and lockfile hashes still matched their pre-pilot baseline.

Command from repository root:

```sh
node_modules/.bin/ts-node --project outputs/spotlift-developer-pilot/tsconfig.json outputs/spotlift-developer-pilot/run-regression.ts
node_modules/.bin/tsc --noEmit -p outputs/spotlift-developer-pilot/tsconfig.json
```

See `../spotlift-developer-pilot/RESULTS.md`. The agent reported four unrelated app-wide typecheck errors in the existing untracked `spotlift-reddit-ops` project; app-wide typecheck is not claimed to pass.

## Index check

The agent wrote `/Users/villedajr/.buzz/GUIDES/SPOTLIFT_DEVELOPER_INDEX.md`, linking its reusable guide and work log. A follow-up task read those files, validated links, compared checkout identity and source hashes, and accurately retained the distinction between simulated evidence and production behavior. Independent link and source-hash checks passed. See `../spotlift-developer-pilot/INDEX_CHECK.md`.

This was a bounded readiness check. Fresh-session isolation and a recurring monitoring schedule were not tested or configured.

## Limits

The corrected hook exists only in the pilot. No production code fix or deployment occurred. The custom synchronous hook simulator does not exercise real React rendering, unmount, devices, localization, or the real API. These tests establish a useful initial coding and retrieval baseline, not universal agent reliability. Existing app edits were preserved.

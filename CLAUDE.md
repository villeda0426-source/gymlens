# SpotLift — working rules

## Baseline

Baseline = the live App Store release commit `351c4d6b80bbe1dfbdf8f80775e9e661da2103fd`
("fix: resolve App Review camera and Apple auth issues", build 44, submitted
2026-08-19). All work branches from it.

Never restore features the live version removed without asking. Before
building on top of the live commit or reconciling diverged branches, diff
against this commit to confirm what's actually shipping versus what only
exists in history.

(Found via `eas build:list --platform ios` — the highest-numbered `STORE`
distribution build, cross-checked against `eas submit:list` timestamps and
`eas channel:list`, which showed zero OTA updates published since. See the
2026-09-28/29 investigation for how a 2026-09-21 branch-reconciliation merge
had silently reintroduced a Home-screen feature — an "Avatar" quick-action
tile — that the live release had already dropped.)

## Working location

All work goes on `release/next` in the main project folder. No worktrees.
Commit and push after every change.

(`redesign/coach-forward` is the predecessor branch this was consolidated
from on 2026-09-30 — see the backup/* branches from that date for every
branch, worktree, and stash that existed at the time, pushed before
anything was combined or rewritten.)

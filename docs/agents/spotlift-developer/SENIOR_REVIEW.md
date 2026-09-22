# SpotLift Developer: senior engineering review

Review date: September 15, 2026. Scope: the developer agent's instructions, portability, learning process, and evidence of readiness. This is not a full application security audit or a measured agent benchmark.

**Verdict: a useful Codex first draft, but not yet a proven Buzz developer.** Its strongest parts are project-specific constraints, modest dependency use, and honest verification. The important gaps concern how the agent is delivered, identifies the code it is working on, and improves over time.

## Findings

### P1 — The first draft cannot be used as a Buzz persona pack

The installed skill contains SKILL.md, Codex UI metadata, and reference files, but no Buzz manifest or persona. Running `buzz pack validate /Users/villedajr/.codex/skills/spotlift-developer` failed with `manifest not found .../.plugin/plugin.json`. See the [first-draft skill](/Users/villedajr/.codex/skills/spotlift-developer/SKILL.md:1).

There is also a second format boundary: Buzz Desktop's agent Import consumes agent snapshots, while persona packs are source packages. Renaming a ZIP or the Codex YAML would not fix this. The [official Buzz specification](https://github.com/block/buzz/blob/b8aa0233f9e36afa1ea83b02ecc5b1ebd20cbee4/crates/buzz-persona/PERSONA_PACK_SPEC.md#desktop-app-import) describes that distinction. The installed CLI supports local pack validate/inspect, not a pack-to-snapshot conversion.

**Remedy in the proposed revision:** a source pack validated with the installed Buzz CLI, plus a self-contained system-prompt file for manual agent creation/editing. No fabricated Desktop snapshot and no claim of completed import.

### P1 — Checkout identity is not strong enough for this workspace

The [orientation instructions](/Users/villedajr/.codex/skills/spotlift-developer/SKILL.md:12) tell the agent to find an active checkout, but do not record its commit or reconcile conflicting research. Actual local checkouts differ:

| Checkout | Branch at inspection | HEAD at inspection |
| --- | --- | --- |
| `/Users/villedajr/SpotLift` | `main` | `351c4d6` |
| `/Users/villedajr/.buzz/REPOS/spotlift` | `main` | `d6e85cb` |
| `/Users/villedajr/.buzz/REPOS/spotlift-coach-reliability-draft` | `fizz/coach-reliability-draft` | `d6e85cb` |

These are commit snapshots; HEAD does not describe uncommitted changes or establish which revision is deployed. Buzz's [Coach blueprint](/Users/villedajr/.buzz/RESEARCH/SPOTLIFT_AI_COACH_RESEARCH_BLUEPRINT_2026_09_15.md) references a different checkout, and its [reliability plan](/Users/villedajr/.buzz/PLANS/SPOTLIFT_COACH_RELIABILITY_FIRST_PLAN.md) is marked draft. Mixing those with the current app can turn proposed behavior into false assumptions.

**Remedy:** start with the user-selected checkout; record root, branch, HEAD, and dirty state. Distinguish code, release evidence, accepted decisions, drafts, and hypotheses. Ask only if the intended target remains ambiguous. Never merge or switch checkouts merely to reconcile notes.

### P2 — There is no durable learning protocol

The [end of the skill](/Users/villedajr/.codex/skills/spotlift-developer/SKILL.md:42) asks for reports and evaluations but does not specify where lessons persist, how evidence is recorded, or when a lesson becomes a rule. This means "learning" can disappear with the conversation or become an unsupported permanent assumption.

The app already has a [decision and learning log](/Users/villedajr/SpotLift/docs/roadmap/decision-log.md:1). Buzz defines WORK_LOGS for session evidence and GUIDES for durable runbooks in its [workspace instructions](/Users/villedajr/.buzz/AGENTS.md:7).

**Remedy:** append brief, evidence-linked records for consequential work; keep temporary context out of stable instructions; route product decisions into the existing log; record supersession instead of erasing history. Learning here means maintained knowledge and instructions, not automatic model retraining.

### P2 — The evaluation table is not an executable benchmark

The [eight scenarios](/Users/villedajr/.codex/skills/spotlift-developer/references/evaluation.md:7) have no fixtures, captured runs, or independent results. The 8/10 threshold is explicitly proposed, so it cannot substantiate a claim about coding quality. Format validation does not test engineering judgment.

There is a useful first pilot candidate: [useEquipmentSearch](/Users/villedajr/SpotLift/hooks/useEquipmentSearch.ts:9) commits each completed request directly without a per-request freshness check in this hook. A controlled overlapping-request test can establish whether an older completion overwrites a newer result. This is a code-level hypothesis for a pilot, not a confirmed end-to-end user defect from this review.

**Remedy:** begin with an isolated local reproduction, demonstrate failure before and success after a focused fix, and record the artifact and result. Keep other scenarios marked not run. Run the same fixture/settings for baseline comparison before claiming improvement.

### P2 — Review requests need an explicit operating mode

The [opening contract](/Users/villedajr/.codex/skills/spotlift-developer/SKILL.md:8) focuses on implementation and completion. It never explicitly separates "review first" from "review and fix." That ambiguity matters for this request and for production investigations.

**Remedy:** review/analysis produces evidence and ranked findings; implementation produces code and tests; release preparation produces verified artifacts and a rollback plan. The user's requested scope determines the mode. Preparing a requested review artifact is allowed; reviewing does not authorize changing application behavior.

### P2 — Agent revisions have no release or rollback identity

The personal skill is outside the repository, and the first draft has no versioned release artifact or process for checking that Buzz and Codex use matching instructions. Changes to one copy can silently drift from the other.

**Remedy:** keep the reviewed Buzz source in the app repository, version the manifest, generate the paste-ready prompt from that source, record checksums, and retain the prior revision. Local lessons can accumulate without changing the agent's stable operating contract on every task. Promote an instruction change when evidence warrants it and verify its effect with a relevant scenario.

## What should remain

- SDK-aware implementation rather than automatic upgrades or new frameworks.
- Existing API retry/idempotency policy and old-client compatibility.
- Verified identity and data ownership, metadata-only AI telemetry, and protection of workout history.
- Rules-first coaching, output validation, and user confirmation for plan changes.
- EN/ES, kg/lbs, device behavior, and honest reporting of unavailable checks.

## Proposed revision and readiness

The adjacent `pack/` is a proposed 0.2.0 revision. It carries the first draft's core workflow and adds portable repository rules, operating modes, checkout identity, and a learning lifecycle. The original personal Codex skill remains unchanged while this revision is reviewed. No application code, active Buzz persona, credentials, or remote memory was changed.

Remaining acceptance work: load the prompt in a real Buzz agent; confirm its selected repository/tools; run one bounded coding pilot; verify the next session retrieves the relevant lesson without assuming unverified results. Package validation alone cannot close those items.

Source provenance: Buzz Desktop 0.5.23; local buzz-cli skill and CLI help; official Buzz source commit `b8aa0233f9e36afa1ea83b02ecc5b1ebd20cbee4`; current local SpotLift files. No claim that the upstream main revision exactly matches the installed app.

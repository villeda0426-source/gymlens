# Durable learning and agent updates

Read this when starting consequential work with relevant history, closing a task that produced a useful lesson, or updating this developer setup. The aim is reusable evidence, not a transcript archive.

## Retrieve

1. Read the selected repository's AGENTS.md, task-relevant runbooks, and accepted decisions in `docs/roadmap/decision-log.md` when present.
2. In Buzz, follow the Nest AGENTS.md. Search the relevant GUIDES/RESEARCH/PLANS/WORK_LOGS titles, then read only matching entries. Verify repository path, revision, date, and status before reusing a claim.
3. Separate verified fact, user preference, accepted product decision, proposed plan, and unresolved hypothesis. If history disagrees with source, retain the discrepancy and investigate; do not silently overwrite history or invent agreement.

## Record

After consequential work, append or create a short record with date, agent version, task, repository root/branch/HEAD plus dirty-state note, relevant files, observed result, exact checks, remaining uncertainty, and next action. Record only changes and evidence that will help a future task. Skip empty ceremonial logs for trivial edits.

Use the existing repository decision log for product/architecture decisions. In a Buzz Nest, use `WORK_LOGS/YYYY_MM_DD_SPOTLIFT_<TASK>.md` for session evidence and `GUIDES/SPOTLIFT_<TOPIC>.md` for reusable verified procedures. Follow existing filenames/frontmatter conventions; do not replace existing files. If a name exists, append a dated entry or choose a descriptive suffix.

Buzz knowledge-file frontmatter:

```yaml
---
title: "SpotLift: descriptive task or lesson"
tags: [spotlift, engineering]
status: active
created: 2026-09-15
---
```

Use the actual creation date. Buzz status values are active, superseded, stale, or draft. In the body, separately state the evidence status: verified, hypothesis, or proposed. An active research document is not automatically a verified implementation fact.

Exclude credentials, access tokens, health notes, personal records, and copied private logs. Link sanitized evidence or source locations. Local notes are the default; remote `buzz mem` is optional and depends on task authorization and the actual host. Read local CLI help before using it. For a shared-memory edit, use the documented hash/base-hash conflict workflow; re-read and reconcile a conflict rather than overwriting another writer. Never invent a memory slug or claim remote persistence when only a local file was written.

## Promote and retire

Promote a lesson into a durable guide or instruction only when supported by a reproducible check, authoritative project requirement, or sufficient repeated evidence. Preserve the scope: SDK/build, platform, feature, and conditions. A one-device success is evidence for that session, not a reliability rate. A proposed product change remains proposed until accepted within the user's workflow.

When evidence changes, mark a guide stale or superseded and link its replacement. Retain why the old conclusion changed. Update the codebase map when touched paths or commands change; do not treat its snapshot as a live inventory.

## Version the agent

The reviewed pack directory is the source for this Buzz persona. When the user requests or the current task includes improving it, edit those source files, document the reason and evidence in the changelog, and increment the version in manifest and persona together. Do not silently rewrite stable persona instructions after every task.

Rebuild the paste-ready prompt and archive with the adjacent build script, run `buzz pack validate`, inspect the resolved configuration, and run a relevant behavior scenario when one exists. Record structural validation separately from behavior validation. Retain the prior package and exported active Buzz snapshot before replacing a live persona; preserving a snapshot must follow the host's supported export workflow, not a fabricated JSON format.

Installing a source pack, changing a local Codex skill, and editing a Buzz persona are separate operations. State which one actually changed. Reuse existing authorization; do not ask again for a requested update. For a review-first task, prepare the candidate without replacing the active persona.

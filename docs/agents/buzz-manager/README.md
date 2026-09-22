# Adanis — AI Chief of Staff

The owner's single point of contact for ideas, assignments, project coordination, and concise reports across their Buzz agents. Internal assignment, messaging, and follow-up are authorized. Spending, publishing, deploying, and outside-human communication require specific owner authorization. Existing authorization carries forward within its scope.

## Live configuration

- Buzz agent: **Adanis**, described as **AI Chief of Staff** to distinguish it from the human owner with the same name.
- Runtime: **Codex**.
- Model: **GPT-5.6 Sol, High reasoning** (`gpt-5.6-sol[high]`).
- Parallelism: **1**, to reduce competing writes to the manager's task ledger.
- Instructions accepted from the owner and their agents, using Buzz's existing default access setting.

The exact exported deployed instructions are in [BUZZ_SYSTEM_PROMPT.txt](BUZZ_SYSTEM_PROMPT.txt). Source pack and installed personal/Buzz skill contain those same instructions. `ADANIS_INSTRUCTIONS.md` retains the longer planning specification; the exact deployed prompt is authoritative for what was installed.

## Using it

Open Buzz → Agents → Adanis → Message, or select its direct message.

- “Let's think through ways to improve onboarding. Discuss first.”
- “Have Desi propose the onboarding flow, then Dev estimate implementation. Bring me a recommendation; don't deploy.”
- “What is done, blocked, and waiting on me?”
- “Pause that task and tell me what has already changed.”

It should verify specialist evidence, preserve task and decision history, avoid duplicate dispatch, and distinguish discussion from execution. These are behavioral instructions, not an independent permissions enforcement layer.

## Restore and maintain

`outputs/adanis-buzz/adanis.agent.png` is the native Buzz-exported snapshot. `outputs/adanis-buzz/0.1.0/adanis-0.1.0.buzzpack` is editable source, not the Desktop import format. `DEPLOYMENT.json` records stable identity, model, and hashes. Preserve Nest tracking files separately; the initial export precedes creation of the live task ledger.

For updates, retain the previous native snapshot, change the prompt through Buzz's editor, increment the workflow/source version, rerun focused acceptance checks, and export again. Do not assume changing a local source file automatically updates the live agent.

Persistent records expected after initialization:

- `/Users/villedajr/.buzz/GUIDES/ADANIS_CHIEF_OF_STAFF_INDEX.md`
- `/Users/villedajr/.buzz/GUIDES/ADANIS_OWNER_PREFERENCES.md`
- `/Users/villedajr/.buzz/PLANS/ADANIS_TASK_LEDGER.md`

No periodic scheduler is installed by this package. Unattended timed follow-up requires a supported configured wakeup; reply-triggered continuation is tested separately. See `outputs/adanis-buzz/READINESS.md` for the live agent's findings and any remaining gaps.

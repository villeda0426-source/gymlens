# SpotLift Developer: deployed Buzz agent

The reviewed 0.2.0 workflow is installed in Buzz as **SpotLift Developer** and in the personal Codex skill folder. The editable source is in `pack/`; the deployed host instructions are in [BUZZ_AGENT_INSTRUCTIONS.md](BUZZ_AGENT_INSTRUCTIONS.md). The original Codex draft is backed up under `outputs/spotlift-developer-buzz/rollback/codex-first-draft/`.

Open Buzz → Agents → SpotLift Developer, or its direct message. The profile provides Message, Stop, Restart, Edit, Export, and Memories controls. Runtime uses the existing Buzz harness default (Claude Code); parallelism is 1. No particular model is pinned.

Deployment and acceptance evidence: `outputs/spotlift-developer-buzz/ACCEPTANCE_REPORT.md`. The genuine Desktop export is `outputs/spotlift-developer-buzz/spotlift-developer.agent.png`; its embedded instructions were checked against the deployed host file. A snapshot does not replace the local installed skill or the linked Nest knowledge files, which must also be retained when moving machines.

## Buzz setup

The generated `BUZZ_SYSTEM_PROMPT.txt` is the complete text to paste into the system-prompt/instructions field when creating or editing **SpotLift Developer** in Buzz. It includes the core workflow, project rules, codebase map, and learning protocol. Keep the runtime/provider/model appropriate to your existing Buzz setup; this package does not set one or grant repository access. Select the intended SpotLift checkout explicitly.

The `.buzzpack` file is a ZIP of the editable persona-pack source, with a SHA-256 companion. **Do not select it in Desktop's Agents → Import.** That UI expects an agent snapshot (`.agent.json` / `.agent.png`); a source pack is a different format. After creating the agent in Buzz, use Buzz's supported export workflow if you need an importable snapshot. The installed CLI offers pack validation/inspection, not snapshot conversion. See the [official format documentation](https://github.com/block/buzz/blob/b8aa0233f9e36afa1ea83b02ecc5b1ebd20cbee4/crates/buzz-persona/PERSONA_PACK_SPEC.md#desktop-app-import).

The pack includes only original developer instructions and references. Expo, Supabase, and OpenAI helper skills are optional host capabilities and are not redistributed here. Core requirements are embedded so missing Codex plugins do not silently remove them. A pasted prompt does not install tools or skills.

## Update workflow

1. Record observed lessons in the repository decision log or Buzz WORK_LOGS; preserve evidence and uncertainty.
2. Edit pack source when the lesson warrants a durable instruction change. Increment manifest/persona versions together and update CHANGELOG.md.
3. Run `python3 docs/agents/spotlift-developer/build_package.py` from the repository root. It validates and inspects the pack before generating files.
4. Run the relevant behavior scenario and record its result. Retain the prior known-good package and, when available, a Buzz-exported snapshot before replacing the active persona.
5. Apply the reviewed revision through Buzz's supported agent editor. Keep remote deployment, messaging, memory writes, and production changes within the user's task scope.

Generated artifacts go into `outputs/spotlift-developer-buzz/`. The builder refuses to replace different contents under the same version, so a version identifies one artifact set. Re-running an unchanged build is safe.

## Acceptance results

The live agent identified the intended checkout and completed an isolated equipment-search race pilot: before, 4 controls passed and 3 races failed; after, all 7 passed. An independent rerun matched. The agent saved a work log and guide, indexed both, and retrieved and checked them from disk in a follow-up turn. Fresh-session isolation was not verified. App source remains unchanged; no recurring monitor was installed. See `outputs/spotlift-developer-pilot/RESULTS.md` and `INDEX_CHECK.md` for evidence and limitations.

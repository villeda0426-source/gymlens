# SpotLift Designer: Buzz agent

Companion to `docs/agents/spotlift-developer/`. The designer creates brand-true UI/UX specs; the developer builds them.

## Buzz setup
1. Run `python3 docs/agents/spotlift-designer/build_package.py` from the repo root. It checks the pack with `buzz pack validate` and writes `outputs/spotlift-designer-buzz/<version>/BUZZ_SYSTEM_PROMPT.txt`.
2. In Buzz, create an agent named **SpotLift Designer**, paste that prompt into its instructions field, use the same runtime as SpotLift Developer, and give it the SpotLift checkout.
3. Add it to the channel where SpotLift Developer works. Mention it with a design request, and it will reply with a spec and mention `@SpotLift Developer`.

The skill is also installed at `~/.agents/skills/spotlift-designer/` so Buzz runtimes that load shared skills (Goose/Codex/Claude Code) can find it.

## Updating
Edit `pack/`, bump the version in `.plugin/plugin.json` and the persona together, add a CHANGELOG entry, and rebuild.

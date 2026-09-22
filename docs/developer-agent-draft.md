# SpotLift Developer — first draft

This setup makes Codex a reusable developer for this app through a personal skill and repository instructions. It does not train a new model, start a background service, or establish a worldwide coding ranking.

## Installed pieces

- Repository `AGENTS.md`: persistent project constraints, compatibility rules, and verification guidance.
- Personal skill `~/.codex/skills/spotlift-developer/`: engineering workflow, codebase map, evaluation cases, and UI metadata. This personal directory is outside Git; AGENTS.md retains the essential project rules for other checkouts/users.
- Expo `expo-data-fetching`: downloaded with the skill installer from `expo/skills`, pinned at commit `39708666ce7014def1f8e34f3d8c93e8d3f588bb`, path `plugins/expo/skills/expo-data-fetching`. Upstream files were not modified.
- Existing OpenAI docs and Supabase/Postgres skills are used selectively when relevant. No duplicate installation was needed.

Use in an app task:

```text
Use $spotlift-developer to fix [problem] in SpotLift. Implement the fix,
verify the affected user flow, and explain any remaining uncertainty.
```

The new skills should be available on the next turn. Start a fresh project task/session to ensure the new AGENTS.md is loaded; if a skill does not appear, restart Codex. No global model or permission configuration was changed.

## Research and decisions

Reviewed September 15, 2026:

- [OpenAI: build skills](https://learn.chatgpt.com/docs/build-skills) documents explicit/implicit invocation and progressive loading. The core workflow is short; codebase and evaluation details are separate references.
- [OpenAI: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) documents project instructions and scope. Repository rules complement the portable personal skill.
- [OpenAI: model guidance](https://developers.openai.com/api/docs/guides/latest-model) emphasizes auditing loaded instructions. This draft checks conflicts and version compatibility instead of accumulating unrelated skills. Model choice remains the user's current setting.
- [Expo's official skills repository](https://github.com/expo/skills) supplied the reviewed networking skill. Repository metadata reported 2,534 stars at inspection. The [older networking listing](https://skills.sh/expo/skills/native-data-fetching) displayed 47.2K installs; that historical name/count is not a measured install count for the renamed expo-data-fetching skill.
- Inspected Expo's current `expo-native-ui` and `expo-router` entrypoints but did not install them: guidance includes SDK 56 APIs and UI preferences that conflict with this SDK 54 app. They can be reconsidered for a deliberate upgrade after compatibility review.

Local evidence matters most: package.json and tsconfigs, README, lib/api.ts, lib/coachingEngine.ts, coach route authorization, reliability runbook, and the smoke/coach evaluation scripts. In particular, local smoke permission does not force a local target, and some evaluation scripts call paid AI or mutate remote test data.

## Validation and next iteration

Validation completed: the bundled skill-creator validator passed, UI YAML checks passed, local skill reference links resolved, and whitespace checks passed. The validator needed PyYAML, which was installed in a temporary isolated Python environment. No app source or production configuration changed, and no application, device, or remote tests were run for this instructions-only draft.

The included eight evaluation scenarios are a future acceptance suite, not completed agent trials. The next useful improvement is to run the agent on a real, bounded app defect and record the patch quality, regression evidence, time, and cost. Change instructions based on observed failures rather than adding generic claims or more tools.

# QA pass — release/next vs. shipped baseline

**Date:** 2026-10-07/08
**Branch reviewed:** `release/next` (`506a60c`) vs. baseline `351c4d6` (build 44, live App Store release)
**Scope:** every commit between the two — 31 commits, 128 files changed, +10,513/-1,822 lines (Coach Forward redesign, Build My Plan tap-only setup, P0–P5 QA fix list, and the new persistent Workout Log).
**Method:** static review (read diffs/files directly, no AI-assisted code generation used to produce the findings below) + `npm run typecheck` / `npm run typecheck:server`. Device testing was attempted and blocked — see "Device testing" below.

## Spec used

Two handoff docs exist in `docs/design/`. They cover different parts of the diff, so I used both rather than forcing one over work it doesn't describe:

- **`docs/design/SpotLift-Redesign-Handoff.md`** — the primary spec for this pass. It covers the Coach Forward redesign, the tab bar, the Build My Plan tap-only flow, and the safety-triage decisions in Section 5. This is what governs the three files you named specifically: `shared/buildTemplatePlan.ts` and `shared/coachProgramming.ts` implement Section 4 (Build My Plan); `components/Equipment/VideoList.tsx`'s change is the Section 3.1 token migration (commit `d6519f4`, P4 #17).
- **`docs/design/workout-log-implementation-handoff.md`** — used only for the two most recent commits, `506a60c` ("Change 2 — persistent workout set log") and `2bed007` ("Change 1 — remove duplicate Today's Workout hero"), which this doc specifies in detail and the redesign handoff doesn't mention at all.

The P0–P5 item numbers in commit messages (e.g. "P2 #9", "P4 #17") refer to an external tracker artifact linked from the redesign handoff (Section 11) that isn't checked into the repo, so I verified those commits against the redesign handoff's own sections plus direct code reading rather than the numbered checklist itself.

## Verification run

- `npm run typecheck` — clean on all tracked app/shared code. The only errors (4, in `spotlift-reddit-ops/`) come from an untracked, unrelated ops project nested in this working tree that `tsconfig.json`'s broad `**/*.ts` include happens to pick up; it's not part of this diff and not part of the SpotLift app.
- `npm run typecheck:server` — clean, no errors.
- EN/ES locale parity (`locales/en.json` vs `locales/es.json`): 0 keys missing in either direction. 22 keys share identical EN/ES text, all legitimate (brand name, "Coach", "Plan", unit abbreviations, language-name labels) — no untranslated strings found.
- Repo-wide scan of the diff for leaked secrets / `EXPO_PUBLIC_*` misuse / logging of prompts or health content: nothing found. The new `SUPABASE_SERVICE_ROLE_KEY` usage (`server/services/workoutGuideCache.ts`) stays server-side.
- Did not run `smoke:api`, `check:release`, or the coach quality/safety baselines — those hit paid AI services and/or remote Supabase with privileged credentials, and that wasn't authorized for this pass.

## Findings

### 1. (High) Under-18 users get zero teen-safe adjustment through the new tap-only plan flow

**Where:** `shared/buildTemplatePlan.ts` (`BuildTemplatePlanInput`, lines 79–89), `shared/planSetupTriage.ts`, `store/planSetupStore.ts:279–289`.

The existing AI chat-based coach already has an age-safety rule: `server/services/coachTrainerService.ts:48` instructs the model that `age_band === "under_18"` means teen-safe programming — no 1RM/max-effort testing, no failure training, conservative progression, technique-first — and that rule is threaded through `server/routes/coach-trainer.ts` from the user's stored `age_band`.

The new tap-only Build My Plan flow (`store/planSetupStore.ts`, feeding `shared/buildTemplatePlan.ts`) is now the **default** onboarding path (per the redesign handoff, Section 4: "replaces chat-based plan setup") and completely bypasses this. `BuildTemplatePlanInput` has no age field, `buildTemplatePlan()` never reads `age_band`, and nothing in `planSetupStore.submit()` fetches or passes it. A signed-in user who is `under_18` and completes the tap-only flow gets exactly the same exercise selection, effort targets, and progression rule as an adult — the one place that age-based prescription limit used to apply no longer runs for this path.

**Trigger:** any account with `profiles.age_band = 'under_18'` goes through `app/plan-setup/*` to build a plan. `buildTemplatePlan()` returns a plan (it always succeeds for any valid combination of goal/days/location/experience), so the AI fallback path — the only place teen-safe programming is implemented — never runs.

This is a confirmed gap against the working rules' "do not weaken prescription limits" and the redesign handoff's own Section 5.2 decision ("Under 18 → teen-safe programming"), not a hypothesis — I read both code paths directly.

### 2. (Medium) Pregnancy is folded into the generic "light/moderate" bucket; the handoff calls for a pregnancy-specific template

**Where:** `shared/planSetupTriage.ts:39` (`"light_moderate"` kind groups `pregnant_or_postpartum` with `heart_condition_or_high_bp`/`other_health_condition`), `shared/buildTemplatePlan.ts:164–166` (the only pregnancy-aware behavior is subtracting 1 from target RPE and appending a disclaimer sentence), `store/planSetupStore.ts:286` (`lightModerate: triage.kind === "light_moderate"`).

`docs/design/SpotLift-Redesign-Handoff.md` Section 5 says: *"Heart condition, other condition, or pregnancy (no symptoms) → plan at light-to-moderate intensity + one dismissible note... **Pregnancy → pregnancy-safe template.**"* — called out as its own clause, distinct from the generic light/moderate treatment. The implementation gives pregnancy exactly the generic treatment and nothing else: there's no pregnancy-aware exercise exclusion anywhere in `shared/coachProgramming.ts` (the `Area` type has no pregnancy-relevant entries — no "avoid supine," no "avoid high-impact," etc.), so a pregnant user can still be prescribed supine/prone exercises from the library (e.g. `glute_bridge`, `dead_bug`, `hip_thrust_bench`, `prone_ytw`) with only a slightly lower RPE target and a disclaimer sentence.

The code is aware of this simplification — `buildTemplatePlan.ts:164` comments "not a separate gate here — just a lower target effort" — so this looks like a deliberate scope-narrowing made during the P2 #9 implementation rather than an oversight, but it's a real deviation from the written spec that someone with product/clinical authority should sign off on rather than me silently treating as fine.

### 3. (Low) A malformed decimal in the Weight field saves silently as blank, with no error shown

**Where:** `app/workout-log.tsx:239` (reps) and `:367`/`:239` (weight parsing).

The Weight `TextInput`'s `onChangeText` filter (`value.replace(/[^0-9.]/g, "")`) strips anything that isn't a digit or a dot, but doesn't limit the dot count, so a string like `"12.5.5"` passes through unchanged (reachable via paste, or a Bluetooth/external keyboard — the on-screen decimal-pad alone makes this harder but not impossible). On blur, `persistSet` computes `Math.max(0, Number(target.weightValue))`, which is `NaN` for that input. `JSON.stringify(NaN)` serializes to `null`, so the request Supabase-js sends ends up writing `weight_value: null` — the row saves successfully (no `error: true`, no retry banner), but the weight the user typed is silently discarded and the field goes blank on the next render. This isn't a crash and doesn't corrupt other rows, but it does contradict the handoff's "do not falsely report success" save-behavior requirement (`docs/design/workout-log-implementation-handoff.md`, "Save and error behavior") — the UI shows success, not the actual outcome.

**Trigger:** paste `12.5.5` (or similar, two-decimal-point string) into a set's Weight field, then blur it.

### 4. (Nit, no functional impact) Tab-bar visual-order comment is inaccurate about the mechanism

**Where:** `components/CoachTabBar.tsx:30–33` claims the visual order (Home, Plan, Scan, Coach, You) is "independent of the route registration order in `app/(tabs)/_layout.tsx`," but the component actually renders `state.routes` filtered in place (lines 69–71) — i.e. in registration order. It currently matches the spec only because `_layout.tsx:19–23` happens to register `index, plan, scan, trainer, profile` in that exact order. If someone reorders the `<Tabs.Screen>` list later for an unrelated reason, the tab bar's visual order would silently follow it, contradicting this comment. Not a present-day bug — flagging because the comment will mislead whoever edits `_layout.tsx` next.

## What got deep review vs. a lighter pass

**Read in full against spec, line by line:**
- `shared/buildTemplatePlan.ts`, `shared/coachProgramming.ts`, `shared/planSetupTriage.ts`, `store/planSetupStore.ts` (Build My Plan generation + safety triage)
- `components/Equipment/VideoList.tsx` (token migration, commit `d6519f4`)
- `supabase/migrations/20261001010000_add_workout_set_logs.sql`, `lib/workoutSetLogs.ts`, `app/workout-log.tsx`, `app/(tabs)/plan.tsx`'s `handleOpenExercise`/Change 1 diff, `components/Equipment/ExerciseLearningCard.tsx` (new persistent Workout Log — highest-risk new surface: user data, RLS, migrations)
- `constants/theme.ts` (new design tokens vs. handoff Section 3.1 — values match exactly)
- `lib/api.ts` (the `cb3d258` timeout/signal fix — confirmed correct: previously a caller-supplied `AbortSignal` silently defeated the per-request timeout; now both the external signal and the internal timeout abort the same controller)
- `server/routes/identify.ts`, `server/services/workoutGuideCache.ts`, `supabase/migrations/20260921000000_add_workout_guides_cache.sql` (P0 #1/#2 — equipment-save failure handling, workout-guide cache RLS — both correct: cache table is `service_role`-only, equipment upsert failure now returns a real error instead of a silent 200)
- `store/coachTrainerStore.ts` conversation-archiving change (`ff93699`) and `shared/importRoutine.ts` (`9c87079`) — both read in full, no issues found
- `app/(tabs)/_layout.tsx`, `components/CoachTabBar.tsx` (tab bar rebuild, `91b447f`) vs. handoff Section 3.2 — order, icon states, equal-width slots, Coach gold dot all match spec

**Diff/commit-message level only (not independently re-verified against spec in detail):** the remaining P3/P4/P5 UI commits not listed above (`fd30608`, `1f22632`, `adde6ba`, `9a18782`), auth screens, `app/(tabs)/index.tsx` Home redesign, Scan/Equipment/Workout screens from Coach Forward Phase 6, `components/Coach/*`, `components/PlanSetup/*`, `components/Scan/ScanResultSheet.tsx`, the age-band migration/`app/(auth)/birth-year.tsx` flow itself (its *consumer* in the coach system prompt was checked; the birth-year capture screen was not re-audited beyond the grep that located it). Given the size of this diff (128 files), this is a judgment call on where review time was worth it — the areas above are the ones with real data/safety/security surface; the rest is largely UI restyling with no typecheck errors and no diff content that stood out on a direct read.

## Device testing — blocked by environment

Attempted per instructions: `gem install --user-install cocoapods`.

It fails during native-extension compilation of a transitive dependency (`nkf`):

```
make: *** No rule to make target
`/Applications/Xcode.app/.../MacOSX27.0.sdk/.../ruby-2.6.0/universal-darwin25/ruby/config.h',
needed by `nkf.o'.  Stop.
```

This is a mismatch between the machine's system Ruby (2.6.10, Apple's bundled/deprecated version) and the current Xcode SDK's header layout — not something `--user-install` or a PATH change can fix. Per your instruction, I stopped here rather than trying `sudo`, installing Homebrew, or installing an alternate Ruby (rbenv/chruby) on your behalf. **This needs your call:** the practical fix is a modern Ruby via a version manager (Homebrew + rbenv/chruby, or `rbenv` installed another way) rather than the system Ruby, but that's a toolchain decision I didn't want to make unilaterally.

No `ios/Podfile` exists yet either (the `ios/` directory only has `.xcode.env` from a prior `expo prebuild`), so this blocks at the first step of `npx expo run:ios`. The iPhone 17 simulator itself is available and Xcode is installed — the only blocker is CocoaPods.

**Device/on-simulator testing for this pass is marked Blocked by environment.** Everything above is static review and typecheck only; none of it was exercised at runtime (navigation flow, keyboard/safe-area behavior, actual EN/ES rendering on-screen, or the Workout Log save/retry/PR-update behavior against a live Supabase instance). Findings #1–#3 are based on reading the code paths, not on reproducing them on-device.

## Recommendations

1. Decide on Finding #1 (teen-safe programming gap) before this ships — it's the clearest regression against a stated safety rule. Either add an `age_band`-aware path to `buildTemplatePlan`/`coachProgramming`, or force `under_18` accounts through the existing AI chat path until that's built.
2. Get a product/clinical call on Finding #2 (pregnancy) — confirm whether the current light/moderate treatment is an accepted interim scope decision or needs real exercise exclusions.
3. Finding #3 is a small, independent fix (reject or sanitize a second decimal point before it reaches `Number()`).
4. When you're ready to fix the CocoaPods/Ruby toolchain, say how you want it installed (Homebrew + rbenv is the common path) and I'll proceed — I didn't want to install Homebrew or use sudo without your OK.

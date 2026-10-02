# Workout Log — implementation handoff v1

**Goal:** Let a signed-in SpotLift user record strength-training sets for one plan exercise, see a read-only all-time personal record (PR), and return to the same exercise later without losing entries. The existing exercise-learning card remains directly below the set table, preserving tutorials, safety, videos, and calculator access.

**Visual reference:** `docs/design/workout-log-reference-v2.png`. It illustrates hierarchy only. The written specification is authoritative, especially where the mockup and current app differ.

**Source request:** `/Users/villedajr/.codex/attachments/ef72d9c3-c5a0-43e5-a80e-d7edb939611b/Pasted text.txt`, Change 2.

**Repository context:** This is an Expo / React Native app. The active Coach plan currently lives in `store/coachTrainerStore.ts` and persists locally in AsyncStorage. The plan is not yet a database entity, so do not invent a foreign key to a non-existent plans table.

## Scope and non-goals

Build the persistent exercise-level Workout Log described below. It is entered from a Plan-tab exercise row and returns to that routine when dismissed.

Do not do any of the following in this change:

- Remove or replace the Plan workout card.
- Replace the existing active-workout timer screen in `app/workout-session.tsx`.
- Implement Change 1's Plan-tab hero/timeline rearrangement.
- Implement Change 4's exercise-detail redesign. The embedded learning card must retain its **four current tabs:** Tutorial, Safety, Videos, Calculator.
- Build endurance/swim/cycle logging, AI-based plan progression from logged sets, rest-timer logic, or a new plans/programs backend.

## Files to inspect first

- `CLAUDE.md`
- `app/(tabs)/plan.tsx`
- `app/equipment/workout-result.tsx`
- `components/Equipment/DetailTabBar.tsx`
- `components/Equipment/TutorialSteps.tsx`
- `components/Equipment/SafetyTips.tsx`
- `components/Equipment/VideoList.tsx`
- `store/coachTrainerStore.ts`
- `store/workoutGuideStore.ts`
- `lib/coachTrainer.ts`
- `lib/supabase.ts`
- `supabase/schema.sql` and all migrations
- `locales/en.json`, `locales/es.json`

## Navigation and user flow

1. In the Plan tab, a signed-in user taps a strength exercise in a selected workout. This opens a new dedicated Workout Log route, not the active-workout timer route.
2. The Workout Log loads the exercise's existing guide content and the current user's saved set entries.
3. The screen displays a set table first, followed immediately by the existing exercise-learning card. Nothing may sit between the table and the card.
4. The user edits reps or weight, toggles Done, adds an extra set, switches guide tabs, watches videos, then navigates back. All set data must persist and reload.
5. Once every originally prescribed set is marked Done, synchronize existing `markExerciseCompleted(exerciseId)` behavior. Do not mark an exercise complete merely because numbers were entered. If a required prescribed set is unchecked again, synchronize the existing completion state back to incomplete.

### Route data

Create a route such as `app/workout-log.tsx` or a parameterized equivalent. Pass only the context required to resolve the selected plan exercise:

- `exerciseId`, `exerciseName`, `plannedSetCount`, `repRange`, `sessionLabel`, `sessionIndex`, and active Coach `threadId` when available.
- The selected guide should continue to use `useWorkoutGuideStore`; show the local fallback guide immediately and refresh it through the existing guide-search path without blocking the log.

Do not pass an entire serialized plan in route parameters. Read active plan state from `useCoachTrainerStore` where needed.

## Layout

Use `SafeScreen` and the existing SpotLift tokens. This is an exercise log, not a second Plan screen.

Top to bottom:

1. Back button, centered title: `Workout Log` / `Registro de entrenamiento`.
2. Exercise name and compact prescription text, for example `4 planned sets · 8–12 reps`.
3. A dark, elevated **Your sets** table/card.
4. The existing exercise-learning card, immediately below the table.
5. A secondary outlined **+ Add set** button below the entire learning card.

The table columns are, in this order:

| Column | Behavior |
| --- | --- |
| PR | Read-only all-time highest logged load for this exercise. Repeat it in each row to match the original annotated reference. |
| Set | Auto-numbered `1`, `2`, `3`…; never editable. |
| Reps | Editable whole number. |
| Weight | Editable non-negative decimal plus a visible unit. Blank means no added load. |
| Done | Accessible toggle. Independent of Reps and Weight. |

On first use, render one draft row for each prescribed set. Initialize reps from the plan's minimum rep target. Initialize weight blank. Draft rows should become persisted records only after the user edits a value or toggles Done; this avoids treating untouched defaults as completed workout data.

`+ Add set` appends a new editable row with the next number. It appears only below the learning card, never above it.

### Existing learning card

Refactor for reuse rather than copy-pasting guide UI. Extract the reusable body of `app/equipment/workout-result.tsx` into a component if necessary, then use it both in the existing full-screen guide and below the Workout Log table.

The card must preserve:

- exercise name and muscle-group chips;
- numbered tutorial steps;
- safety guidance;
- video/YouTube discovery and retry state;
- calculator;
- all four tabs: Tutorial, Safety, Videos, Calculator.

The current visual mockup has Tutorial selected and therefore does not display a video thumbnail in the body. The **Videos** tab is how the user reaches YouTube videos. Do not merge Tutorial and Safety in this change.

## Data model and persistence

Use Supabase for durable workout-set records. Add one additive migration named with the project convention, for example `supabase/migrations/20261001010000_add_workout_set_logs.sql`.

Create `public.workout_set_logs` with one row per logged set. It needs at least:

| Field | Requirement |
| --- | --- |
| `id` | UUID primary key. |
| `user_id` | Required UUID referencing `public.profiles(id)`, cascade delete. |
| `workout_instance_id` | Required UUID grouping sets performed in one visit. |
| `exercise_id` | Required stable text ID from the plan exercise catalogue. |
| `exercise_name` | Required text snapshot for readable history. |
| `plan_thread_id` | Nullable text; store the local Coach thread ID as context only, not a foreign key. |
| `session_index` and `session_label` | Nullable plan context for future reporting. |
| `plan_week` | Nullable positive integer; derive from `sessionIndex / daysPerWeek` when those values exist. |
| `set_number` | Required positive integer. Unique with `workout_instance_id`. |
| `reps` | Nullable non-negative integer, bounded reasonably. |
| `weight_value` | Nullable non-negative numeric decimal. |
| `weight_unit` | Required `kg` or `lbs`; preserve the unit entered for that set. |
| `weight_kg` | A stored canonical conversion or equivalent queryable value for PR comparisons. It must be null when `weight_value` is null. |
| `completed` | Required boolean, default false. |
| `performed_at`, `created_at`, `updated_at` | Required timestamps with sane defaults. |

Add database constraints for valid units, positive set numbers, non-negative numeric values, and a unique `(workout_instance_id, set_number)` pair. Add indexes for:

- loading an exercise's records by user/exercise/date;
- computing the user/exercise PR from `weight_kg`.

Enable RLS. An authenticated user may select, insert, update, and delete only rows where `user_id = auth.uid()`. Verify with an owner, a second authenticated user, and an anonymous request. Do not apply remote migrations until the normal project workflow authorizes it.

### Workout instance behavior

The app has no durable plan table. Use `workout_instance_id` to group this exercise's set rows for one workout visit rather than creating a new plans backend.

On screen open:

- Find the latest set-log instance for the signed-in user, selected exercise, selected plan-thread/session context, and current local calendar day.
- If one exists, reload it.
- Otherwise create a client UUID and hold draft rows locally until the first edit, toggle, or Add set action creates the corresponding record.

This gives a user an interrupt-safe same-day return without overwriting prior workout history.

### PR behavior

PR is derived, never editable. For a given user and exercise, it is the maximum non-null `weight_kg` across that user's saved set logs, regardless of Done state. This follows the handwritten requirement that Done is independent from logging values.

Display the PR in the user's current preferred unit, converted for display. Preserve every entry's original `weight_value` and `weight_unit`; never silently rewrite historic lbs values as kg or the reverse. For bodyweight/no-added-load sets, leave Weight blank and exclude them from load PR calculations. Show `—` when no load PR exists.

## Save and error behavior

- Save reps and weight on field blur/submit, and save Done immediately on toggle.
- Avoid one network mutation per keystroke. Keep the entered draft visible while a save is in flight.
- Disable or visually busy only the affected row/control, not the entire card.
- On save failure, retain the user's draft, show a concise inline retry state, and do not falsely report success.
- Reload PR after a successful write that could change it.
- Add an error state for guide/video fetch failures using the existing retry behavior; log entry failure must not hide the learning card.

## Copy

Add complete EN and ES copy under a dedicated `workout_log` namespace. Suggested keys:

| Key | EN | ES |
| --- | --- | --- |
| `title` | Workout Log | Registro de entrenamiento |
| `your_sets` | Your sets | Tus series |
| `personal_best` | Personal best: {{value}} | Récord personal: {{value}} |
| `pr` | PR | RM |
| `set` | Set | Serie |
| `reps` | Reps | Repeticiones |
| `weight` | Weight | Peso |
| `done` | Done | Hecha |
| `add_set` | Add set | Agregar serie |
| `planned_sets` | {{count}} planned sets | {{count}} series planeadas |
| `save_error` | Couldn't save this set. Try again. | No se pudo guardar esta serie. Inténtalo de nuevo. |
| `retry` | Retry | Reintentar |
| `no_pr` | — | — |
| `bodyweight` | Bodyweight | Peso corporal |

Use natural neutral Latin-American Spanish. Do not hard-code any visible text.

## Accessibility and interaction

- Every icon-only control needs an accessibility label.
- Reps and weight fields need explicit labels that include set number, for example `Set 2 reps` / `Repeticiones de la serie 2`.
- Done must expose checked/unchecked state to VoiceOver/TalkBack and remain independent from field values.
- Preserve logical reading order: screen title → exercise → table headers/rows → learning card → Add set.
- Targets must be at least 44 pt. Numeric text uses tabular figures.
- Use the established success haptic when a set is checked Done; do not haptically buzz on every numeric edit.
- Support 130% text and long Spanish labels. On narrow screens, keep table column labels readable; do not make them tiny. A horizontally scrollable table with a persistent first column is acceptable if necessary, but test its accessibility.

## Verification

1. Run `npm run typecheck` and `npm run typecheck:server`.
2. With one authenticated test account, verify:
   - opening a plan exercise shows the log table and the learning card below it;
   - reps, weight, and Done can each change independently;
   - Add set adds and persists a correctly numbered row below the existing card;
   - leaving and returning reloads the same-day rows;
   - entering a higher load updates the read-only PR;
   - a blank bodyweight load does not create a numeric PR;
   - completing all prescribed sets updates the existing Plan completion state.
3. Verify unit behavior: log both kg and lbs, preserve their original displayed units, and compare PR only via canonical conversion.
4. Verify RLS with two different users plus unauthenticated access.
5. Visually inspect English and Spanish at standard and 130% text size. Confirm Videos remains accessible from the learning card.
6. Review the diff to ensure the active workout timer and Change 4 tab redesign were not modified.

## Completion criteria

- [ ] A Plan exercise opens the Workout Log.
- [ ] A user can add, edit, complete, persist, and reload set rows.
- [ ] The PR is read-only and correctly updates from historical logged weight.
- [ ] Weight unit is stored per row and compared correctly across kg/lbs.
- [ ] The existing exercise learning card remains immediately below the log table with Tutorial, Safety, Videos, and Calculator intact.
- [ ] `+ Add set` appears below that card.
- [ ] EN/ES, error states, accessibility, and RLS checks pass.

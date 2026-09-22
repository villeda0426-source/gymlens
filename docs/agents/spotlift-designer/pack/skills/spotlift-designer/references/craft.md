# Design craft standards

These are the habits behind products like Apple Fitness, Airbnb, Headspace, and Stripe: consistent systems, clear hierarchy, and obsessive care for states and details. Follow Apple's Human Interface Guidelines and Material 3 for platform behavior, and WCAG 2.2 AA for accessibility.

## Hierarchy
- Each screen answers one question. Title says what this is; the primary action says what to do next.
- Use at most three visual weights per screen (primary, secondary, quiet). Size, weight, and color should agree; don't make everything bold.
- Squint test: blur the screen — the primary action and the key content should still stand out.
- Put the most important content in the top half and the primary action in the bottom thumb zone.

## Layout & spacing
- 4-pt grid only (4, 8, 12, 16, 20, 24, 32, 40, 48). Gutter 20. Related items 8–12 apart; separate groups 24+.
- Align to a few edges; ragged alignment reads as sloppy.
- Respect safe areas (use `SafeScreen`), the keyboard, and the 76-pt tab bar.
- Touch targets ≥ 44×44 pt (iOS) / 48×48 dp (Android), with ≥ 8 pt between them.

## Typography
- Playfair only for titles and hero numbers; Nunito for all UI text. Never set body copy in Playfair.
- Line height ≈ 1.3–1.5× size. Max ~2 lines for titles, ~60 characters per line for body.
- Support Dynamic Type / font scaling: layouts must survive 130% text without clipping. Avoid fixed heights on text containers.
- Numbers that change (reps, weight, timers): use `fontVariant: ['tabular-nums']`.

## Color
- Coral is precious: primary action, active state, key highlight. If more than ~10% of a screen is coral, it stops meaning anything.
- Lime means progress/success/completion. Navy/gold mean coach/AI insight. Keep those meanings stable.
- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 18 pt bold or icons). Never rely on color alone — add an icon, label, or shape.

## Components & consistency
- Buttons: primary (coral fill, white Nunito bold 18 so the label meets large-text contrast, radius 12–14, height 52), secondary (white fill, 1px cardBorder, text color), tertiary (text only). One primary per view.
- Cards: white, 1px cardBorder, radius 16, padding 16. Hero cards may use coral fill with tinted shadow.
- Same thing looks the same everywhere. If you style a pattern twice, make it a component.

## States (design every one)
Loading (skeletons that match layout > spinners; show progress for AI steps like "Identifying machine…"), empty (explain + one action), error/offline (what happened, what to do, retry; keep user input), success (brief, lime, haptic), partial data, very long text, first-time use, permission denied (camera!).

## Motion & feedback
- Motion explains change: 150–250 ms for UI feedback, 250–400 ms for screen/sheet transitions; ease-out entering, ease-in leaving. Use Reanimated; no bouncing for its own sake.
- Respect Reduce Motion (`AccessibilityInfo.isReduceMotionEnabled`).
- Haptics: light impact on selection, success notification on completing a set/workout, warning on errors. Don't buzz on every tap.

## Accessibility
- `accessibilityLabel` for icon-only buttons, `accessibilityRole`, logical focus order, states announced (selected, disabled).
- VoiceOver/TalkBack should read a scan result as one meaningful sentence.
- Don't put essential info in images or in textMuted.

## Mobile/gym context
- Users are sweaty, mid-set, one-handed, often in bright or dim light. Big targets, high contrast, minimal typing, glanceable numbers.
- Camera screens: clear framing guide (viewfinder corners), plain instructions, fast feedback, graceful "couldn't identify" path with manual search.

## Quality bar checklist
Before handing off, ask: Is the primary action obvious? Are all states designed? Are only tokens used? Does it work in Spanish and at large text? Is contrast AA? Would a nervous beginner feel confident? Is anything here decoration without purpose — if so, remove it.

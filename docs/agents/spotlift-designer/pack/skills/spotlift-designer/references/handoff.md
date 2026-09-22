# Handoff spec (designer → SpotLift Developer)

Use this template. Keep it as short as the feature allows; skip sections that don't apply.

```markdown
# <Feature / screen> — design spec v<n>

**Goal:** <who, what they're doing, what success looks like>
**Files likely touched:** <paths>
**Reuses:** <existing components/tokens>

## Layout
<top-to-bottom structure with spacing values; ASCII wireframe if helpful>

## Tokens & styles
<new or changed tokens; ready-to-paste StyleSheet snippet(s) using `colors` / `fonts`>

## Components
<new/changed components: props, variants, sizes>

## States
- Loading: …  - Empty: …  - Error/offline: …  - Success: …  - Long ES text / large font: …

## Interaction & motion
<taps, gestures, transitions (duration/easing), haptics, reduce-motion fallback>

## Copy
| key | EN | ES |
|---|---|---|

## Accessibility
<labels, roles, order, contrast notes>

## Acceptance checks
- [ ] <observable check the developer and designer can both verify>

## Open questions
<only real decisions for the user>
```

Rules:
- Every value maps to a token or a stated number — no "make it a bit bigger".
- Propose i18n keys that follow the existing `locales/*.json` structure.
- Flag anything that needs a new dependency; prefer what's installed (Ionicons, Reanimated, expo-haptics).
- If the developer says something is expensive, offer the nearest cheaper design that keeps the intent.

# SpotLift design rules (portable)

Snapshot from the SpotLift repository, September 16, 2026. Verify against the selected checkout.

- The live design system is `constants/theme.ts` (`colors`, `fonts`), imported by the app's screens. `tailwind.config.js` holds an older dark/neon palette that no screen uses; do not design from it.
- The app is light-mode only (`userInterfaceStyle: "light"`), Expo SDK 54 / React Native 0.81, styled with `StyleSheet` + theme tokens, icons from Ionicons, haptics via expo-haptics, Reanimated available.
- Every user-facing string needs English and Spanish (`locales/en.json`, `locales/es.json`). Design for Spanish length (about 30% longer).
- Preserve kg/lbs meaning, workout history, the pain/safety flow, and confirmation before AI plan changes. Design never weakens a safety step to reduce friction.
- The developer agent (`spotlift-developer`) implements. Designer hands off specs, not unreviewed app-logic changes.

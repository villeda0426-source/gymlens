# SpotLift brand (snapshot 2026-09-16)

**Product:** AI gym companion — point the camera at equipment, learn what it is, which muscles it works, how to use it safely, then get an adaptive plan. EN/ES. iOS + Android.
**Tagline:** "Your gym, finally explained." Store line: "Meet every machine. Train every muscle."
**Audience:** gym beginners and returners who feel intimidated. They need clarity and reassurance, not bro-culture hype.
**Personality:** warm, smart, encouraging, clean. A friendly coach, not a drill sergeant. Confident without shouting.
**Voice:** short, plain, second person, active verbs ("Scan a machine", "Start workout"). Celebrate progress briefly. Never shame. Safety copy is calm and direct.

## Logo
- Mark: a coral "S" made of two arcs, with a dumbbell whose center plate is a lime ring, framed by four dark camera-viewfinder corners. Files: `assets/images/spotlift-mark.png`, `spotlift-logo.png`, `spotlift-letters-logo.png`.
- Wordmark: geometric sans; "Spot" in dark ink, "lift" in coral, lime dot on the "i".
- Give the mark clear space ≥ the corner-bracket length. Don't recolor, stretch, add effects, or put it on busy photos.

## Signature motifs
- **Viewfinder corners** (scan brackets) — the brand's core idea: "we identify it". Use for scan UI, equipment highlights, and hero moments; don't sprinkle everywhere.
- **Anatomy illustration** — clean line figure with targeted muscles filled coral.
- **Soft cream background with subtle coral glow**; realistic, clean equipment renders.

## Color tokens (`constants/theme.ts`)
| token | hex | use |
|---|---|---|
| bg | #faf7f0 | app background (warm cream) |
| card | #ffffff | cards, sheets, tab bar |
| cardBorder / divider | #ede8dc | 1px borders, separators |
| input | #f0ece3 | inputs, chips, quiet fills |
| coral | #e04e4e | primary brand + primary actions, active tab, targeted muscles |
| lime | #6aaa00 | success, progress, completion, "go" |
| ndNavy | #0c2340 | trainer/coach surfaces, deep accents |
| ndGold | #c99700 | coach insights, AI/analysis accents (sparingly) |
| text | #1a1a1a | primary text |
| textSecondary | #666666 | secondary text |
| textMuted | #999999 | hints, metadata (not for essential info; low contrast) |
| danger | #e04e4e | errors (same as coral — pair with an icon + text so errors read as errors) |
| success | #6aaa00 | success |
Plan tab uses a dark tab bar `#111112`.

Contrast (measured): coral/white 3.9:1 — passes only for large text (≥18 bold / ≥24 regular) and icons; white button labels on coral should be ≥18 bold, or use a deeper `coralPressed` (#c53838, 5.25:1) for text-bearing fills if a redesign touches buttons. Lime/white 2.85:1 and ndGold/white 2.65:1 — icons and fills only; for green text propose a `limeText` token (#4f8000, 4.75:1). textMuted/bg 2.66:1 — decorative only. textSecondary/bg 5.4:1 and text/bg 16:1 are safe.

## Type (`fonts`)
- heading: PlayfairDisplay_700Bold (serif, editorial warmth) — screen titles, big numbers/moments.
- body: Nunito_400Regular; semiBold 600; bold 700; extraBold 800 — everything else.
- Sizes in use: 11, 12, 13, 14, 15, 16, 18 (+ larger headings). Preferred scale: 12 caption · 14 body-sm · 16 body · 18 subhead · 22 title · 28 hero · 34 display.

## Shape, depth, icons
- Radii in use: 8, 10, 12, 14 (most common), 16, 18, 20. Preferred scale: 8 small chips · 12 inputs/buttons · 16 cards · 20 hero cards · 999 pills.
- Spacing: 4-pt grid; screen gutter 20; card padding 16; section gap 24.
- Shadows: soft and tinted — e.g. hero card `shadowColor: coral, opacity 0.22, radius 14, offset (0,6), elevation 4`. Neutral cards rely on border, not heavy shadow.
- Icons: Ionicons (outline for inactive, filled for active). Icon tiles: 44–48 square, radius 14–15, translucent white on coral.
- Tab bar: white, 1px top border, 76 tall, icon-only.

## Inconsistencies (raise, don't silently pick)
1. `tailwind.config.js` defines an unused dark/neon palette (#E8FF47, Barlow Condensed, DM Sans). The live brand is theme.ts. Recommend removing or updating it so no one builds from it.
2. The wordmark is geometric sans but in-app headings use Playfair serif — a deliberate pairing or drift? Ask before a brand refresh.
3. `danger` and `coral` are the same color, so errors can look like primary actions. Always pair errors with an icon and message; consider a distinct error red token if a redesign touches this.
4. ~20 hard-coded hexes (#f59e0b, #3b82f6, #ec4899, #06b6d4…) appear in screens — likely muscle-group/category colors. Propose a named `categoryColors` token set when touching them.
5. The Android feature graphic (`assets/store/android/feature-graphic.png`) reads "Spolift" — missing the "t". Flag it for a fix.
6. `ndNavy`/`ndGold` are named for another brand (Notre Dame?); consider renaming to `coachNavy`/`coachGold` in a token cleanup.

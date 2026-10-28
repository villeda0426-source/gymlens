# SpotLift website — app showcase

## Direction

Let a prospective gym beginner see what SpotLift does before downloading it. Lead with original app screens rather than feature descriptions. Use the current Coach Forward Outfit/Figtree type and dark workout palette, with cream sections, coral actions, and lime for progress accents.

The homepage is a static site in `coachlift-web/`: `index.html`, `styles.css`, `app.js`, and locally hosted image assets. No build or new dependency is required.

## Implemented experience

- Dark, oversized opening with three clickable equipment, plan, and workout-journal screens.
- Four-part feature tour: plan, scan, guided workout, and progress. Selecting a tab changes the screenshots, title, supporting copy, and screen enlargement target. Arrow keys, Home, and End navigate the tabs.
- Twelve-screen gallery with plan/workout/equipment filters, horizontal scrolling, and desktop navigation arrows.
- Native dialog screenshot viewer with previous/next, left/right arrows, Escape, touch swipe, focus containment, and restored focus on close. Navigation respects the gallery filter.
- Three example Coach instructions change the explanation. These are explicitly examples, not a live AI conversation.
- App Store download links, privacy, support, and Instagram.

## Screenshot provenance

Original app captures from the owner's October 27 App Store source folder (`Archives/V6-2026-10-27/sources`) and the `1.0.8(52)/screenshots` folder. WebP copies preserve the screen content and aspect ratio. No design mockups, fabricated weekly data, or QA profile screenshots are included.

| Asset | Original capture |
| --- | --- |
| plan | IMG_5592.png |
| exercises | IMG_5595.png |
| log | IMG_5596.png |
| tutorial | IMG_5598.png |
| safety | IMG_5599.png |
| equipment | IMG_5603.png |
| videos | IMG_5604.png |
| goals | IMG_5605.png |
| location | IMG_5607.png |
| options | IMG_5610.png |
| workout | 02-guided-workout-log-set.png |
| scan | 11-scan-result.png |

The twelve optimized screenshots total about 526 KB. Offscreen screenshots load lazily. Explicit image dimensions reserve layout space. The original brand mark is retained.

## Verification

Visually reviewed at 1440, 701, 390, and 320 CSS pixels. Exercised tour selection and keyboard navigation, gallery filtering, screenshot enlargement, dialog keyboard navigation and Escape, focus restoration, and the interactive Coach examples in the browser. Static checks cover JavaScript syntax, all referenced local assets, unique IDs, single H1, section links, three App Store links, and the support address.

Reduced motion disables animation and smooth scrolling. Buttons have visible keyboard focus; tabs expose selection and roving focus; the modal uses native dialog behavior. No network request is made when someone uses the tour, filters, examples, or viewer.

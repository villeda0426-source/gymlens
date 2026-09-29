/** @type {import('tailwindcss').Config} */
// NativeWind/Tailwind is unused in this app: zero files use `className`
// anywhere (confirmed 2026-09-26). The colors/fontFamily previously extended
// here (a bright neon palette + BarlowCondensed/DMSans/SpaceMono fonts) were
// from an earlier, abandoned design direction and were never wired into any
// screen. Real design tokens live in `constants/theme.ts` (colors/fonts) and
// its Coach Forward additions (coachColors/coachFonts/coachDark) — nobody
// should style from this file. Left intentionally empty rather than deleted,
// since nativewind's preset expects a valid config to build against.
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};

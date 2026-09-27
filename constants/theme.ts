// "Coach Forward" design tokens.
//
// `colors`/`fonts` below are UNCHANGED in value from before this redesign —
// every existing, not-yet-redesigned screen keeps rendering exactly as it did.
// `coachColors`/`coachFonts`/`coachDark`/`spacing`/`radii` are additive: the
// new Coach Forward palette, consumed only by screens as each is redesigned
// (starting Phase 2). The one deliberate exception is `ndGold`, called out by
// name below.

export const colors = {
  // Backgrounds
  bg: "#faf7f0",
  card: "#ffffff",
  cardBorder: "#ede8dc",
  input: "#f0ece3",
  divider: "#ede8dc",

  // Accents
  coral: "#e04e4e",
  lime: "#6aaa00",
  ndNavy: "#0c2340", // same value as new coachNavy below; safe to prefer coachNavy going forward
  // Deliberately repointed (not a value-preserving alias): the new coachGold
  // (#e8b923) is the same icon/text-on-navy role ndGold served, at a slightly
  // different shade. Every existing ndGold usage (trainer.tsx, plan.tsx) is
  // icon/text-on-navy, so this is a safe, in-scope color nudge, not a restyle.
  ndGold: "#e8b923",

  // Text
  text: "#1a1a1a",
  textSecondary: "#666666",
  textMuted: "#999999",

  // Special
  danger: "#e04e4e",
  success: "#6aaa00",
  white: "#ffffff",
};

export const fonts = {
  heading: "PlayfairDisplay_700Bold",
  body: "Nunito_400Regular",
  semiBold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extraBold: "Nunito_800ExtraBold",
};

// --- Coach Forward: new tokens, additive only ---------------------------

// Light screens (Home, Coach, Equipment). Not used by any screen until it is
// individually redesigned in Phases 2-6.
export const coachColors = {
  bg: "#f5f3ee",
  card: "#ffffff",
  border: "#dcd8cf",
  text: "#14171f",
  textSecondary: "#5b6270",

  coral: "#e04e4e",
  coralPressed: "#c53838",
  lime: "#6aaa00",
  limeText: "#4f8000",

  coachNavy: "#0c2340",
  coachGold: "#e8b923",
  coachGoldText: "#8a6700",

  // Safety/warnings — never coral, so a warning never looks like a button/error.
  amberIcon: "#8a5a00",
  amberText: "#5c3d00",
};

// Dark screens (Scan, Workout — "dark to lift").
export const coachDark = {
  bg: "#0e1116",
  surface: "#1a1e25",
  raised: "#2a2f38",
  text: "#f5f3ee",
  textSecondary: "#a9b1bd",
  coralOnDark: "#ff6b61",
  limeOnDark: "#9ad63a",
  // The lime "Log set" button uses dark text, not white, for contrast on lime.
  limeOnDarkText: "#0e1116",
};

// Outfit (headings/big numbers) + Figtree (body/UI).
export const coachFonts = {
  heading: "Outfit_700Bold",
  headingSemiBold: "Outfit_600SemiBold",
  headingExtraBold: "Outfit_800ExtraBold",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemiBold: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
  bodyExtraBold: "Figtree_800ExtraBold",
};

// 4-pt spacing grid + shared shape constants, for new components.
export const spacing = {
  screenGutter: 20,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radii = {
  pill: 999,
  card: 22,
  cardLarge: 24,
  sheet: 32,
};

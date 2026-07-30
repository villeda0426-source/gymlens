import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import Svg, { Path, Circle, Ellipse, G } from "react-native-svg";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 32 - 12) / 3;
const SVG_W = CARD_WIDTH - 16;
const SVG_H = SVG_W * 2.2;

const COLOR_PRIMARY = "#e04e4e";
const COLOR_SECONDARY = "#6aaa00";
const COLOR_INACTIVE = "#ede8dc";
const COLOR_BODY = "#f0ece3";
const COLOR_OUTLINE = "#d4cfc5";

// Maps equipment muscle_groups strings → front/back muscle keys
// Includes both short category names (from Supabase equipment rows) and
// longer anatomical names (as returned by the Gemini workout-search guide).
const MUSCLE_ALIASES: Record<string, string[]> = {
  chest: ["chest"],
  pectorals: ["chest"],
  pectoral: ["chest"],
  pecs: ["chest"],
  shoulders: ["front_deltoid", "side_deltoid"],
  shoulder: ["front_deltoid", "side_deltoid"],
  deltoids: ["front_deltoid", "side_deltoid"],
  deltoid: ["front_deltoid", "side_deltoid"],
  front_deltoid: ["front_deltoid"],
  front_deltoids: ["front_deltoid"],
  anterior_deltoid: ["front_deltoid"],
  anterior_deltoids: ["front_deltoid"],
  side_deltoid: ["side_deltoid"],
  side_deltoids: ["side_deltoid"],
  lateral_deltoid: ["side_deltoid"],
  lateral_deltoids: ["side_deltoid"],
  rear_deltoid: ["rear_deltoid"],
  rear_deltoids: ["rear_deltoid"],
  posterior_deltoid: ["rear_deltoid"],
  posterior_deltoids: ["rear_deltoid"],
  biceps: ["biceps"],
  bicep: ["biceps"],
  biceps_brachii: ["biceps"],
  triceps: ["triceps"],
  tricep: ["triceps"],
  triceps_brachii: ["triceps"],
  forearms: ["forearms"],
  forearm: ["forearms"],
  abs: ["abs"],
  ab: ["abs"],
  abdominals: ["abs"],
  abdominal: ["abs"],
  rectus_abdominis: ["abs"],
  obliques: ["obliques"],
  oblique: ["obliques"],
  core: ["abs", "obliques"],
  quadriceps: ["quadriceps"],
  quads: ["quadriceps"],
  quad: ["quadriceps"],
  hamstrings: ["hamstrings"],
  hamstring: ["hamstrings"],
  glutes: ["glutes"],
  glute: ["glutes"],
  gluteus_maximus: ["glutes"],
  calves: ["calves"],
  calf: ["calves"],
  gastrocnemius: ["calves"],
  soleus: ["calves"],
  back: ["upper_back", "lats"],
  upper_back: ["upper_back"],
  rhomboids: ["upper_back"],
  rhomboid: ["upper_back"],
  lats: ["lats"],
  lat: ["lats"],
  latissimus_dorsi: ["lats"],
  lower_back: ["lower_back"],
  erector_spinae: ["lower_back"],
  traps: ["traps"],
  trap: ["traps"],
  trapezius: ["traps"],
  hip_flexors: ["hip_flexors"],
  hip_flexor: ["hip_flexors"],
  hip_abductors: ["outer_thigh"],
  hip_abductor: ["outer_thigh"],
  abductors: ["outer_thigh"],
  hip_adductors: ["inner_thigh"],
  hip_adductor: ["inner_thigh"],
  adductors: ["inner_thigh"],
  inner_thigh: ["inner_thigh"],
  inner_thighs: ["inner_thigh"],
  outer_thigh: ["outer_thigh"],
  outer_thighs: ["outer_thigh"],
  full_body: [
    "chest", "front_deltoid", "abs", "quadriceps", "upper_back", "lats", "glutes", "hamstrings",
  ],
  cardiovascular: [],
};

// Normalizes free-text muscle names (e.g. "Latissimus Dorsi (Lats)" from the
// Gemini workout-search guide) into alias-dictionary keys.
function normalizeMuscleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveHighlighted(muscleGroups: string[]): Set<string> {
  const out = new Set<string>();
  for (const m of muscleGroups) {
    const key = normalizeMuscleKey(m);
    const mapped = MUSCLE_ALIASES[key];
    if (mapped) mapped.forEach((k) => out.add(k));
    else out.add(key);
  }
  return out;
}

// ─── Front body SVG ─────────────────────────────────────────────────────────
interface FrontBodyProps {
  highlighted: Set<string>;
  w: number;
  h: number;
}

function FrontBody({ highlighted, w, h }: FrontBodyProps) {
  const c = (key: string, isPrimary = true) =>
    highlighted.has(key) ? (isPrimary ? COLOR_PRIMARY : COLOR_SECONDARY) : COLOR_INACTIVE;

  // scale helpers: paths are designed on a 60x140 canvas
  const sx = w / 60;
  const sy = h / 140;
  const s = (x: number) => x * sx;
  const t = (y: number) => y * sy;

  return (
    <Svg width={w} height={h} viewBox="0 0 60 140">
      {/* Body fill */}
      <G>
        {/* HEAD */}
        <Ellipse cx="30" cy="8" rx="8" ry="9" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.8" />

        {/* NECK */}
        <Path d="M26 15 Q30 18 34 15 L33 20 Q30 22 27 20 Z" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />

        {/* TORSO */}
        <Path d="M18 21 Q12 25 11 45 L13 70 Q20 72 30 72 Q40 72 47 70 L49 45 Q48 25 42 21 Z"
          fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.8" />

        {/* CHEST */}
        <Path d="M21 24 Q25 28 30 27 Q35 28 39 24 L40 34 Q35 38 30 37 Q25 38 20 34 Z"
          fill={c("chest")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

        {/* ABS */}
        <Path d="M24 38 Q30 39 36 38 L37 50 Q33 52 30 51 Q27 52 23 50 Z"
          fill={c("abs")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />

        {/* OBLIQUES */}
        <Path d="M20 40 L24 38 L23 50 L18 55 Z" fill={c("obliques")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.8" />
        <Path d="M40 40 L36 38 L37 50 L42 55 Z" fill={c("obliques")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.8" />

        {/* HIP FLEXORS */}
        <Path d="M23 52 L28 52 L27 62 L21 60 Z" fill={c("hip_flexors")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.8" />
        <Path d="M37 52 L32 52 L33 62 L39 60 Z" fill={c("hip_flexors")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.8" />

        {/* FRONT DELTOID */}
        <Path d="M18 21 Q12 22 9 28 Q11 34 15 36 Q18 30 20 24 Z"
          fill={c("front_deltoid")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
        <Path d="M42 21 Q48 22 51 28 Q49 34 45 36 Q42 30 40 24 Z"
          fill={c("front_deltoid")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

        {/* SIDE DELTOID */}
        <Path d="M10 27 Q7 30 7 36 Q9 38 11 37 Q11 33 12 29 Z"
          fill={c("side_deltoid")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />
        <Path d="M50 27 Q53 30 53 36 Q51 38 49 37 Q49 33 48 29 Z"
          fill={c("side_deltoid")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />

        {/* BICEPS */}
        <Path d="M8 36 Q5 40 5 50 Q8 52 11 50 Q12 44 12 38 Z"
          fill={c("biceps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
        <Path d="M52 36 Q55 40 55 50 Q52 52 49 50 Q48 44 48 38 Z"
          fill={c("biceps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

        {/* FOREARMS */}
        <Path d="M5 50 Q3 56 4 64 Q7 65 10 63 Q11 57 11 50 Z"
          fill={c("forearms")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />
        <Path d="M55 50 Q57 56 56 64 Q53 65 50 63 Q49 57 49 50 Z"
          fill={c("forearms")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />

        {/* HANDS */}
        <Ellipse cx="5.5" cy="67" rx="3.5" ry="4" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />
        <Ellipse cx="54.5" cy="67" rx="3.5" ry="4" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />

        {/* PELVIS / hips */}
        <Path d="M21 62 Q30 68 39 62 L42 72 Q36 76 30 76 Q24 76 18 72 Z"
          fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.6" />

        {/* INNER THIGH */}
        <Path d="M28 73 Q26 80 26 90 L30 90 L30 73 Z"
          fill={c("inner_thigh")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.8" />
        <Path d="M32 73 Q34 80 34 90 L30 90 L30 73 Z"
          fill={c("inner_thigh")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.8" />

        {/* QUADRICEPS left */}
        <Path d="M20 70 Q16 74 15 85 Q17 95 21 98 Q24 90 25 75 Z"
          fill={c("quadriceps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
        {/* QUADRICEPS right */}
        <Path d="M40 70 Q44 74 45 85 Q43 95 39 98 Q36 90 35 75 Z"
          fill={c("quadriceps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

        {/* OUTER THIGH */}
        <Path d="M18 70 Q14 73 14 85 Q16 90 18 90 Q17 80 19 72 Z"
          fill={c("outer_thigh")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.8" />
        <Path d="M42 70 Q46 73 46 85 Q44 90 42 90 Q43 80 41 72 Z"
          fill={c("outer_thigh")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.8" />

        {/* LOWER LEG / shin */}
        <Path d="M15 99 Q13 108 14 118 Q16 120 19 119 Q22 108 22 98 Z"
          fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />
        <Path d="M45 99 Q47 108 46 118 Q44 120 41 119 Q38 108 38 98 Z"
          fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />

        {/* CALVES front (tibia) */}
        <Path d="M15 99 Q14 107 14.5 117 Q16.5 119 18.5 118 Q20 108 20 99 Z"
          fill={c("calves")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.7" />
        <Path d="M45 99 Q46 107 45.5 117 Q43.5 119 41.5 118 Q40 108 40 99 Z"
          fill={c("calves")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.7" />

        {/* FEET */}
        <Ellipse cx="16.5" cy="122" rx="5" ry="2.5" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />
        <Ellipse cx="43.5" cy="122" rx="5" ry="2.5" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />

        {/* TRAPS (small triangle at neck base) */}
        <Path d="M24 19 Q30 23 36 19 L38 22 Q30 26 22 22 Z"
          fill={c("traps")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />
      </G>
    </Svg>
  );
}

// ─── Back body SVG ────────────────────────────────────────────────────────────
interface BackBodyProps {
  highlighted: Set<string>;
  w: number;
  h: number;
}

function BackBody({ highlighted, w, h }: BackBodyProps) {
  const c = (key: string) =>
    highlighted.has(key) ? COLOR_PRIMARY : COLOR_INACTIVE;

  return (
    <Svg width={w} height={h} viewBox="0 0 60 140">
      {/* HEAD */}
      <Ellipse cx="30" cy="8" rx="8" ry="9" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.8" />

      {/* NECK */}
      <Path d="M26 15 Q30 18 34 15 L33 20 Q30 22 27 20 Z" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />

      {/* TORSO BACK */}
      <Path d="M18 21 Q12 25 11 45 L13 70 Q20 72 30 72 Q40 72 47 70 L49 45 Q48 25 42 21 Z"
        fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.8" />

      {/* TRAPS */}
      <Path d="M22 20 Q26 25 30 24 Q34 25 38 20 L40 28 Q35 33 30 32 Q25 33 20 28 Z"
        fill={c("traps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* REAR DELTOID */}
      <Path d="M18 21 Q12 22 9 28 Q11 34 15 36 Q18 30 20 24 Z"
        fill={c("rear_deltoid")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
      <Path d="M42 21 Q48 22 51 28 Q49 34 45 36 Q42 30 40 24 Z"
        fill={c("rear_deltoid")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* UPPER BACK / rhomboids */}
      <Path d="M20 28 Q25 34 30 33 Q35 34 40 28 L40 40 Q35 44 30 43 Q25 44 20 40 Z"
        fill={c("upper_back")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* LATS */}
      <Path d="M13 35 Q11 45 12 58 Q17 62 20 58 Q19 48 20 38 Z"
        fill={c("lats")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
      <Path d="M47 35 Q49 45 48 58 Q43 62 40 58 Q41 48 40 38 Z"
        fill={c("lats")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* LOWER BACK */}
      <Path d="M22 48 Q30 52 38 48 L38 60 Q34 64 30 63 Q26 64 22 60 Z"
        fill={c("lower_back")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />

      {/* TRICEPS */}
      <Path d="M8 36 Q5 40 5 50 Q8 52 11 50 Q12 44 12 38 Z"
        fill={c("triceps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
      <Path d="M52 36 Q55 40 55 50 Q52 52 49 50 Q48 44 48 38 Z"
        fill={c("triceps")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* FOREARMS BACK */}
      <Path d="M5 50 Q3 56 4 64 Q7 65 10 63 Q11 57 11 50 Z"
        fill={c("forearms")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />
      <Path d="M55 50 Q57 56 56 64 Q53 65 50 63 Q49 57 49 50 Z"
        fill={c("forearms")} stroke={COLOR_OUTLINE} strokeWidth="0.4" opacity="0.85" />

      {/* HANDS */}
      <Ellipse cx="5.5" cy="67" rx="3.5" ry="4" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />
      <Ellipse cx="54.5" cy="67" rx="3.5" ry="4" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />

      {/* GLUTES */}
      <Path d="M18 63 Q22 70 30 70 Q38 70 42 63 L42 72 Q36 78 30 77 Q24 78 18 72 Z"
        fill={c("glutes")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* HAMSTRINGS */}
      <Path d="M18 73 Q15 80 15 92 Q18 98 22 97 Q24 88 24 75 Z"
        fill={c("hamstrings")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
      <Path d="M42 73 Q45 80 45 92 Q42 98 38 97 Q36 88 36 75 Z"
        fill={c("hamstrings")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* CALVES BACK */}
      <Path d="M15 98 Q13 107 14 118 Q17 121 20 119 Q22 109 22 98 Z"
        fill={c("calves")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />
      <Path d="M45 98 Q47 107 46 118 Q43 121 40 119 Q38 109 38 98 Z"
        fill={c("calves")} stroke={COLOR_OUTLINE} strokeWidth="0.5" opacity="0.9" />

      {/* OUTER THIGH BACK */}
      <Path d="M14 73 Q11 80 12 92 Q14 95 16 93 Q15 83 16 74 Z"
        fill={c("outer_thigh")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.8" />
      <Path d="M46 73 Q49 80 48 92 Q46 95 44 93 Q45 83 44 74 Z"
        fill={c("outer_thigh")} stroke={COLOR_OUTLINE} strokeWidth="0.3" opacity="0.8" />

      {/* FEET */}
      <Ellipse cx="16.5" cy="122" rx="5" ry="2.5" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />
      <Ellipse cx="43.5" cy="122" rx="5" ry="2.5" fill={COLOR_BODY} stroke={COLOR_OUTLINE} strokeWidth="0.5" />
    </Svg>
  );
}

// ─── Category icon ────────────────────────────────────────────────────────────
const CATEGORY_EMOJI: Record<string, string> = {
  machine: "🏋️",
  free_weight: "🪨",
  cable: "🔗",
  cardio: "🏃",
  accessory: "🎯",
};

// ─── Main component ───────────────────────────────────────────────────────────
interface MuscleMapViewProps {
  muscleGroups: string[];
  category?: string;
}

export default function MuscleMapView({ muscleGroups, category }: MuscleMapViewProps) {
  const { t } = useTranslation();
  const highlighted = resolveHighlighted(muscleGroups || []);
  const emoji = CATEGORY_EMOJI[category || ""] || "🏋️";

  // Determine which muscles are front vs back for label display
  const activeFront = (muscleGroups || []).filter((m) => {
    const keys = MUSCLE_ALIASES[normalizeMuscleKey(m)] || [];
    return keys.some((k) =>
      ["chest", "front_deltoid", "side_deltoid", "biceps", "abs", "obliques", "quadriceps", "hip_flexors", "inner_thigh", "outer_thigh", "forearms", "calves", "traps"].includes(k)
    );
  });
  const activeBack = (muscleGroups || []).filter((m) => {
    const keys = MUSCLE_ALIASES[normalizeMuscleKey(m)] || [];
    return keys.some((k) =>
      ["upper_back", "lats", "lower_back", "traps", "rear_deltoid", "triceps", "hamstrings", "glutes", "calves", "outer_thigh"].includes(k)
    );
  });

  return (
    <View style={styles.container}>
      {/* Front card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t("equipment.front").toUpperCase()}</Text>
        <View style={styles.svgWrap}>
          <FrontBody highlighted={highlighted} w={SVG_W} h={SVG_H} />
        </View>
        {activeFront.length > 0 && (
          <View style={styles.dot}>
            <View style={styles.dotInner} />
          </View>
        )}
      </View>

      {/* Back card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t("equipment.back").toUpperCase()}</Text>
        <View style={styles.svgWrap}>
          <BackBody highlighted={highlighted} w={SVG_W} h={SVG_H} />
        </View>
        {activeBack.length > 0 && (
          <View style={styles.dot}>
            <View style={styles.dotInner} />
          </View>
        )}
      </View>

      {/* Equipment icon card */}
      <View style={[styles.card, styles.iconCard]}>
        <Text style={styles.cardLabel}>{t("equipment.type").toUpperCase()}</Text>
        <Text style={styles.equipIcon}>{emoji}</Text>
        <Text style={styles.categoryLabel}>
          {(category || "").replace("_", " ").toUpperCase()}
        </Text>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: COLOR_PRIMARY }]} />
            <Text style={styles.legendText}>{t("equipment.primary")}</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: COLOR_SECONDARY }]} />
            <Text style={styles.legendText}>{t("equipment.secondary")}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 6,
    paddingBottom: 8,
  },
  card: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ede8dc",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    overflow: "hidden",
    position: "relative",
  },
  cardLabel: {
    color: "#999999",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  svgWrap: {
    alignItems: "center",
  },
  dot: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR_PRIMARY,
  },
  iconCard: {
    justifyContent: "center",
    gap: 4,
  },
  equipIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  categoryLabel: {
    color: "#e04e4e",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  legend: {
    marginTop: 12,
    gap: 5,
    alignItems: "flex-start",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: "#999999",
    fontSize: 9,
    fontWeight: "600",
  },
});

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "@/constants/theme";

// Keyword → color. Matched by substring so longer, free-text muscle names
// (e.g. "Latissimus Dorsi (Lats)" from the AI workout-search guide) still
// resolve to a sensible color, not just exact category names.
const MUSCLE_KEYWORD_COLORS: [string, string][] = [
  ["chest", "#e04e4e"],
  ["pec", "#e04e4e"],
  ["back", "#3b82f6"],
  ["lat", "#3b82f6"],
  ["trap", "#3b82f6"],
  ["rhomboid", "#3b82f6"],
  ["shoulder", "#f59e0b"],
  ["deltoid", "#f59e0b"],
  ["bicep", "#10b981"],
  ["tricep", "#6366f1"],
  ["quad", "#ec4899"],
  ["hamstring", "#ec4899"],
  ["leg", "#ec4899"],
  ["glute", "#f97316"],
  ["core", "#6aaa00"],
  ["ab", "#6aaa00"],
  ["oblique", "#6aaa00"],
  ["calf", "#06b6d4"],
  ["calves", "#06b6d4"],
  ["forearm", "#8b5cf6"],
];
const DEFAULT_COLOR = colors.textMuted;

function colorForMuscle(group: string): string {
  const normalized = group.toLowerCase().replace(/\([^)]*\)/g, " ");
  const match = MUSCLE_KEYWORD_COLORS.find(([keyword]) => normalized.includes(keyword));
  return match ? match[1] : DEFAULT_COLOR;
}

interface MuscleGroupTagsProps {
  groups: string[];
}

export default function MuscleGroupTags({ groups }: MuscleGroupTagsProps) {
  return (
    <View style={styles.container}>
      {groups.map((group) => {
        const color = colorForMuscle(group);
        return (
          <View key={group} style={[styles.tag, { backgroundColor: color + "18", borderColor: color + "40" }]}>
            <Text style={[styles.text, { color }]}>{group}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 13, fontFamily: fonts.semiBold, textTransform: "capitalize" },
});

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "@/constants/theme";

const MUSCLE_COLORS: Record<string, string> = {
  chest: "#e04e4e",
  back: "#3b82f6",
  shoulders: "#f59e0b",
  biceps: "#10b981",
  triceps: "#6366f1",
  legs: "#ec4899",
  glutes: "#f97316",
  core: "#6aaa00",
  calves: "#06b6d4",
  forearms: "#8b5cf6",
  default: colors.textMuted,
};

interface MuscleGroupTagsProps {
  groups: string[];
}

export default function MuscleGroupTags({ groups }: MuscleGroupTagsProps) {
  return (
    <View style={styles.container}>
      {groups.map((group) => {
        const color = MUSCLE_COLORS[group.toLowerCase()] || MUSCLE_COLORS.default;
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

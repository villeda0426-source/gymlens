import React from "react";
import { View, Text, StyleSheet } from "react-native";

const MUSCLE_COLORS: Record<string, string> = {
  chest: "#FF6B6B",
  back: "#4ECDC4",
  shoulders: "#FFE66D",
  biceps: "#A8E6CF",
  triceps: "#88D8B0",
  legs: "#FF8B94",
  glutes: "#FFAAA5",
  core: "#E8FF47",
  calves: "#85D4E3",
  forearms: "#C3A6FF",
  default: "#888888",
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
          <View key={group} style={[styles.tag, { backgroundColor: color + "22", borderColor: color + "44" }]}>
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
  text: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
});

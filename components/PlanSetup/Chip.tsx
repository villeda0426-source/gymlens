import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import * as Haptics from "expo-haptics";
import { coachColors, coachFonts } from "@/constants/theme";

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}

export default function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { borderColor: coachColors.coachNavy, backgroundColor: coachColors.coachNavy },
  text: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.text },
  textSelected: { color: coachColors.card },
});

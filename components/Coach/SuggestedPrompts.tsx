// Coach Forward quick-reply chip row — Phase 3.
//
// Restyles the existing quick-actions row (all 8 actions kept — the mockup's
// static frame only has room to show 2, but the horizontal scroll it implies
// is exactly this row) to the new pill-chip tokens.
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";

export interface SuggestedPrompt {
  key: string;
  label: string;
}

interface SuggestedPromptsProps {
  prompts: SuggestedPrompt[];
  onPress: (key: string) => void;
}

export default function SuggestedPrompts({ prompts, onPress }: SuggestedPromptsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {prompts.map((prompt) => (
        <TouchableOpacity key={prompt.key} style={styles.chip} onPress={() => onPress(prompt.key)}>
          <Text style={styles.chipText}>{prompt.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
});

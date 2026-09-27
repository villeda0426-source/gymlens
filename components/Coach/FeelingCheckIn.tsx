// Coach Forward "How does your body feel today?" card — Phase 3.
//
// Local/ephemeral only (resets each time the screen mounts): there is no
// backend concept of a daily feeling check-in today. Selecting an option
// sends a real chat message down the existing submitMessage pipeline (the
// "sore" phrasing genuinely hits the rules router's soreness template), so
// this is a styled front-end for real behavior, not a cosmetic dead end.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";

export type Feeling = "fresh" | "okay" | "sore";

const OPTIONS: Feeling[] = ["fresh", "okay", "sore"];

interface FeelingCheckInProps {
  selected: Feeling | null;
  onSelect: (feeling: Feeling) => void;
}

export default function FeelingCheckIn({ selected, onSelect }: FeelingCheckInProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("trainer.feeling_check_in.title")}</Text>
      <View style={styles.row}>
        {OPTIONS.map((feeling) => {
          const isSelected = selected === feeling;
          return (
            <TouchableOpacity
              key={feeling}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(feeling)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {t(`trainer.feeling_check_in.${feeling}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: coachColors.coachNavy,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: coachColors.card, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  row: { flexDirection: "row", gap: spacing.sm },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  chipSelected: {
    borderWidth: 0,
    backgroundColor: coachColors.coachGold,
  },
  chipText: { color: coachColors.card, fontFamily: coachFonts.bodyBold, fontSize: 14, textAlign: "center" },
  chipTextSelected: { color: coachColors.coachNavy, fontFamily: coachFonts.bodyExtraBold },
});

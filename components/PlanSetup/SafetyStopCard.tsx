// Chest pain or dizziness when active -> don't generate a plan. A calm card,
// not an error state: scanning equipment and browsing exercises still work.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import ContinueButton from "@/components/PlanSetup/ContinueButton";

interface SafetyStopCardProps {
  onClearedByDoctor: () => void;
}

export default function SafetyStopCard({ onClearedByDoctor }: SafetyStopCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <View style={styles.iconTile}>
        <Ionicons name="heart" size={26} color={coachColors.amberIcon} />
      </View>
      <Text style={styles.title}>{t("plan_setup.stop_card.title")}</Text>
      <Text style={styles.body}>{t("plan_setup.stop_card.body")}</Text>
      <Text style={styles.hint}>{t("plan_setup.stop_card.still_available")}</Text>
      <ContinueButton label={t("plan_setup.stop_card.cleared_button")} onPress={onClearedByDoctor} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, alignItems: "flex-start" },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#fff3e0",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: coachFonts.heading, fontSize: 22, color: coachColors.text },
  body: { fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21, color: coachColors.textSecondary },
  hint: { fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19, color: coachColors.textSecondary },
});

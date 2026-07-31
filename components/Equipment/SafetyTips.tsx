import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";

interface SafetyTipsProps {
  tips: string[];
  emptyLabel?: string;
}

export default function SafetyTips({ tips, emptyLabel }: SafetyTipsProps) {
  const { t } = useTranslation();
  const resolvedEmptyLabel = emptyLabel ?? t("equipment.safety_empty");

  if (tips.length === 0) {
    return <Text style={styles.empty}>{resolvedEmptyLabel}</Text>;
  }

  return (
    <View style={styles.container}>
      {tips.map((tip, index) => (
        <View key={index} style={styles.safetyItem}>
          <Text style={styles.safetyIcon}>⚠️</Text>
          <Text style={styles.safetyText}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  empty: { color: colors.textMuted, fontFamily: fonts.body, textAlign: "center", paddingVertical: 16 },
  safetyItem: {
    flexDirection: "row", gap: 12,
    backgroundColor: colors.coral + "0f", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.coral + "30",
  },
  safetyIcon: { fontSize: 18, flexShrink: 0 },
  safetyText: { color: colors.text, fontSize: 14, fontFamily: fonts.body, lineHeight: 22, flex: 1 },
});

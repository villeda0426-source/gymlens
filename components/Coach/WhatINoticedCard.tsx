// Coach Forward "What I noticed" row — Phase 4.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { CoachWeekObservation } from "@/lib/coachWeekService";

export default function WhatINoticedCard({ observation }: { observation: CoachWeekObservation }) {
  const isPositive = observation.tone === "positive";

  return (
    <View style={styles.card}>
      <View style={[styles.icon, isPositive ? styles.iconPositive : styles.iconAttention]}>
        <Ionicons
          name={isPositive ? "trending-up" : "calendar-outline"}
          size={20}
          color={isPositive ? coachColors.limeText : coachColors.coachGoldText}
        />
      </View>
      <Text style={styles.text}>{observation.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconPositive: { backgroundColor: "#eef6e0" },
  iconAttention: { backgroundColor: "#faf1d9" },
  text: { flex: 1, color: coachColors.text, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21 },
});

// Coach Forward weekly check-in header — Phase 4.
//
// Full-bleed navy panel (rounded bottom corners) with a back button, the
// week's workout count, and a 7-bar mini chart. Handles its own top safe-area
// inset so the navy fills all the way under the status bar, per the mockup.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachDark, coachFonts, radii, spacing } from "@/constants/theme";
import BarChart from "@/components/UI/BarChart";
import { CoachWeekDay } from "@/lib/coachWeekService";

interface WeekProgressHeaderProps {
  weekNumber: number;
  workoutsCompleted: number;
  workoutsPlanned: number;
  headline: string;
  days: CoachWeekDay[];
  onBack: () => void;
}

export default function WeekProgressHeader({
  weekNumber,
  workoutsCompleted,
  workoutsPlanned,
  headline,
  days,
  onBack,
}: WeekProgressHeaderProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.panel, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t("coach_week.back")}
        >
          <Ionicons name="chevron-back" size={20} color={coachColors.card} />
        </TouchableOpacity>
        <Text style={styles.eyebrow}>{t("coach_week.eyebrow")}</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statsCopy}>
          <Text style={styles.weekLabel}>{t("coach_week.week", { number: weekNumber })}</Text>
          <Text style={styles.bigNumber}>{t("coach_week.ratio", { done: workoutsCompleted, total: workoutsPlanned })}</Text>
          <Text style={styles.headline}>{headline}</Text>
        </View>
        <View style={styles.chartWrap}>
          <BarChart
            bars={days.map((day, index) => ({
              key: `${day.label}-${index}`,
              value: day.status === "done" ? day.intensity : 0.05,
              color: coachDark.limeOnDark,
            }))}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: coachColors.coachNavy,
    borderBottomLeftRadius: radii.sheet,
    borderBottomRightRadius: radii.sheet,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonSpacer: { width: 44 },
  eyebrow: { color: coachColors.coachGold, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.6 },
  statsRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  statsCopy: { gap: 4, flexShrink: 1 },
  weekLabel: { color: "#b9c3d1", fontFamily: coachFonts.bodySemiBold, fontSize: 14 },
  bigNumber: { color: coachColors.card, fontFamily: coachFonts.headingExtraBold, fontSize: 54, lineHeight: 50 },
  headline: { color: "#dbe2ea", fontFamily: coachFonts.body, fontSize: 15 },
  chartWrap: { width: 130, height: 70 },
});

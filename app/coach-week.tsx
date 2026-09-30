// Coach Forward weekly check-in — Phase 4. Auto-routed (no Stack.Screen
// entry needed), matching equipment/workout-result.tsx's precedent.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import WeekProgressHeader from "@/components/Coach/WeekProgressHeader";
import WhatINoticedCard from "@/components/Coach/WhatINoticedCard";
import ChangesForNextWeekCard from "@/components/Coach/ChangesForNextWeekCard";
import { approveCoachWeekChanges, CoachWeekSummary, getCoachWeekSummary } from "@/lib/coachWeekService";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";

export default function CoachWeekScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { plan } = useCoachTrainerStore();
  const [summary, setSummary] = useState<CoachWeekSummary | null>(null);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    let active = true;
    getCoachWeekSummary(plan).then((result) => {
      if (active) setSummary(result);
    });
    return () => {
      active = false;
    };
  }, [plan]);

  const handleApprove = () => {
    if (!summary) return;
    approveCoachWeekChanges(summary);
    setApproved(true);
  };

  if (!summary) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={coachColors.coachGold} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <WeekProgressHeader
          weekNumber={summary.weekNumber}
          workoutsCompleted={summary.workoutsCompleted}
          workoutsPlanned={summary.workoutsPlanned}
          headline={summary.headline}
          days={summary.days}
          onBack={() => router.back()}
        />

        <View style={styles.body}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("coach_week.what_i_noticed")}</Text>
            {summary.observations.map((observation) => (
              <WhatINoticedCard key={observation.id} observation={observation} />
            ))}
          </View>

          {approved ? (
            <View style={styles.approvedCard}>
              <Ionicons name="checkmark-circle" size={20} color={coachColors.limeText} />
              <Text style={styles.approvedText}>{t("coach_week.approved_notice")}</Text>
            </View>
          ) : (
            <ChangesForNextWeekCard
              changes={summary.changes}
              onApprove={handleApprove}
              onEdit={() => router.push("/(tabs)/trainer")}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: coachColors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: coachColors.bg },
  scrollContent: { paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: {
    color: coachColors.textSecondary,
    fontFamily: coachFonts.bodyExtraBold,
    fontSize: 12,
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  approvedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#eef6e0",
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  approvedText: { flex: 1, color: coachColors.limeText, fontFamily: coachFonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
});

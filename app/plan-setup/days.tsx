// Plan setup step 2 of 5 — "How many days a week can you train?" (Days.png)
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import ProgressHeader from "@/components/PlanSetup/ProgressHeader";
import ContinueButton from "@/components/PlanSetup/ContinueButton";
import { coachColors, coachFonts } from "@/constants/theme";
import { usePlanSetupStore, type SessionMinutes } from "@/store/planSetupStore";

const DAY_OPTIONS = [2, 3, 4, 5, 6];
const MINUTE_OPTIONS: SessionMinutes[] = [30, 45, 60];

function splitHintKey(days: number): string {
  if (days <= 2) return "full_body";
  if (days === 3) return "full_body";
  if (days === 4) return "upper_lower";
  return "push_pull_legs";
}

export default function PlanSetupDaysScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { daysPerWeek, sessionMinutes, setDaysPerWeek, setSessionMinutes } = usePlanSetupStore();

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProgressHeader
          step={2}
          onBack={() => router.back()}
          backLabel={t("plan_setup.back")}
          stepLabel={t("plan_setup.step_of", { step: 2 })}
        />

        <View style={styles.header}>
          <View style={styles.coachRow}>
            <View style={styles.coachBadge}>
              <Text style={styles.coachStar}>★</Text>
            </View>
            <Text style={styles.coachLabel}>{t("plan_setup.coach_label")}</Text>
          </View>
          <Text style={styles.title}>{t("plan_setup.days.title")}</Text>
          <Text style={styles.helper}>{t("plan_setup.days.helper")}</Text>
        </View>

        <View style={styles.daysRow}>
          {DAY_OPTIONS.map((value) => {
            const selected = daysPerWeek === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setDaysPerWeek(value);
                }}
                style={[styles.dayButton, selected && styles.dayButtonSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={
                  selected
                    ? t("plan_setup.option_selected", { title: t("plan_setup.days.day_count", { count: value }) })
                    : t("plan_setup.days.day_count", { count: value })
                }
              >
                <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{value}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.minutesSection}>
          <Text style={styles.minutesLabel}>{t("plan_setup.days.minutes_label")}</Text>
          <View style={styles.segmented}>
            {MINUTE_OPTIONS.map((value) => {
              const selected = sessionMinutes === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSessionMinutes(value);
                  }}
                  style={[styles.segment, selected && styles.segmentSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    selected
                      ? t("plan_setup.option_selected", { title: t("plan_setup.days.minutes_value", { minutes: value }) })
                      : t("plan_setup.days.minutes_value", { minutes: value })
                  }
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                    {t("plan_setup.days.minutes_value", { minutes: value })}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {daysPerWeek && sessionMinutes ? (
          <View style={styles.tipCard}>
            <Ionicons name="sparkles" size={16} color={coachColors.coachGold} style={styles.tipIcon} />
            <Text style={styles.tipText}>
              {t(`plan_setup.days.tip.${splitHintKey(daysPerWeek)}`, { days: daysPerWeek, minutes: sessionMinutes })}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <ContinueButton
          label={t("plan_setup.continue")}
          onPress={() => router.push("/plan-setup/where")}
          disabled={!daysPerWeek || !sessionMinutes}
        />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: coachColors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 20, paddingBottom: 24 },
  header: { gap: 10 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  coachBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  coachStar: { color: coachColors.coachGold, fontSize: 13 },
  coachLabel: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.textSecondary },
  title: { fontFamily: coachFonts.heading, fontSize: 30, lineHeight: 35, color: coachColors.text },
  helper: { fontFamily: coachFonts.body, fontSize: 15, color: coachColors.textSecondary },
  daysRow: { flexDirection: "row", gap: 8 },
  dayButton: {
    flex: 1,
    height: 72,
    borderRadius: 18,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  dayButtonSelected: { backgroundColor: coachColors.coachNavy },
  dayText: { fontFamily: coachFonts.heading, fontSize: 22, color: coachColors.text },
  dayTextSelected: { color: coachColors.card },
  minutesSection: { gap: 10 },
  minutesLabel: { fontFamily: coachFonts.heading, fontSize: 17, color: coachColors.text },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#e2ddd2",
    borderRadius: 999,
    padding: 4,
  },
  segment: { flex: 1, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  segmentSelected: {
    backgroundColor: coachColors.card,
    ...{ shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  },
  segmentText: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.textSecondary },
  segmentTextSelected: { color: coachColors.text },
  tipCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: coachColors.card,
    borderRadius: 18,
    padding: 16,
  },
  tipIcon: { marginTop: 2 },
  tipText: { flex: 1, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21, color: coachColors.text },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
});

// Plan setup step 1 of 5 — "What's your main goal?" (docs/design/build-my-plan/Main.png)
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import ProgressHeader from "@/components/PlanSetup/ProgressHeader";
import OptionCard from "@/components/PlanSetup/OptionCard";
import ContinueButton from "@/components/PlanSetup/ContinueButton";
import { coachColors, coachFonts } from "@/constants/theme";
import { usePlanSetupStore, type PlanSetupGoal } from "@/store/planSetupStore";

const GOALS: Array<{
  value: PlanSetupGoal;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
}> = [
  { value: "strength", icon: "barbell", iconBg: "#fdecec", iconColor: "#c53838" },
  { value: "hypertrophy", icon: "body", iconBg: "#eef1f6", iconColor: "#0c2340" },
  { value: "fat_loss", icon: "water", iconBg: "#fff3e0", iconColor: "#8a5a00" },
  { value: "general_fitness", icon: "pulse", iconBg: "#eef6e0", iconColor: "#4f8000" },
];

export default function PlanSetupGoalScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { goal, setGoal } = usePlanSetupStore();

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProgressHeader
          step={1}
          onBack={() => router.back()}
          backLabel={t("plan_setup.close")}
          stepLabel={t("plan_setup.step_of", { step: 1 })}
        />

        <View style={styles.header}>
          <View style={styles.coachRow}>
            <View style={styles.coachBadge}>
              <Text style={styles.coachStar}>★</Text>
            </View>
            <Text style={styles.coachLabel}>{t("plan_setup.coach_label")}</Text>
          </View>
          <Text style={styles.title}>{t("plan_setup.goal.title")}</Text>
          <Text style={styles.helper}>{t("plan_setup.goal.helper")}</Text>
        </View>

        <View style={styles.options}>
          {GOALS.map((option) => (
            <OptionCard
              key={option.value}
              icon={option.icon}
              iconBg={option.iconBg}
              iconColor={option.iconColor}
              title={t(`plan_setup.goal.options.${option.value}.title`)}
              description={t(`plan_setup.goal.options.${option.value}.description`)}
              selected={goal === option.value}
              onPress={() => setGoal(option.value)}
              accessibilityLabel={
                goal === option.value
                  ? t("plan_setup.option_selected", { title: t(`plan_setup.goal.options.${option.value}.title`) })
                  : t(`plan_setup.goal.options.${option.value}.title`)
              }
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <ContinueButton
          label={t("plan_setup.continue")}
          onPress={() => router.push("/plan-setup/days")}
          disabled={!goal}
        />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: coachColors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 24, paddingBottom: 24 },
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
  options: { gap: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
});

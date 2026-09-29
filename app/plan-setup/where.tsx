// Plan setup step 3 of 5 — "Where will you train?" (Where.png)
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
import { usePlanSetupStore, type PlanSetupLocation } from "@/store/planSetupStore";

const LOCATIONS: Array<{
  value: PlanSetupLocation;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
}> = [
  { value: "full_gym", icon: "scan", iconBg: "#14171f", iconColor: "#6aaa00" },
  { value: "dumbbells_home", icon: "home", iconBg: "#eef1f6", iconColor: "#0c2340" },
  { value: "bodyweight", icon: "walk", iconBg: "#eef6e0", iconColor: "#4f8000" },
];

export default function PlanSetupWhereScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { location, setLocation } = usePlanSetupStore();

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProgressHeader
          step={3}
          onBack={() => router.back()}
          backLabel={t("plan_setup.back")}
          stepLabel={t("plan_setup.step_of", { step: 3 })}
        />

        <View style={styles.header}>
          <View style={styles.coachRow}>
            <View style={styles.coachBadge}>
              <Text style={styles.coachStar}>★</Text>
            </View>
            <Text style={styles.coachLabel}>{t("plan_setup.coach_label")}</Text>
          </View>
          <Text style={styles.title}>{t("plan_setup.where.title")}</Text>
          <Text style={styles.helper}>{t("plan_setup.where.helper")}</Text>
        </View>

        <View style={styles.options}>
          {LOCATIONS.map((option) => (
            <OptionCard
              key={option.value}
              icon={option.icon}
              iconBg={option.iconBg}
              iconColor={option.iconColor}
              title={t(`plan_setup.where.options.${option.value}.title`)}
              description={t(`plan_setup.where.options.${option.value}.description`)}
              selected={location === option.value}
              onPress={() => setLocation(option.value)}
              accessibilityLabel={
                location === option.value
                  ? t("plan_setup.option_selected", { title: t(`plan_setup.where.options.${option.value}.title`) })
                  : t(`plan_setup.where.options.${option.value}.title`)
              }
            />
          ))}
        </View>

        <View style={styles.tipRow}>
          <Ionicons name="scan" size={16} color={coachColors.limeText} />
          <Text style={styles.tipText}>{t("plan_setup.where.tip")}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <ContinueButton
          label={t("plan_setup.continue")}
          onPress={() => router.push("/plan-setup/experience")}
          disabled={!location}
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
  options: { gap: 10 },
  tipRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingHorizontal: 2 },
  tipText: { flex: 1, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19, color: coachColors.textSecondary },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
});

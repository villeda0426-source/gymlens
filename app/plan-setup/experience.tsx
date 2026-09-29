// Plan setup step 4 of 5 — "How much have you trained before?" (Experience.png)
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
import { usePlanSetupStore, type PlanSetupExperience } from "@/store/planSetupStore";

const EXPERIENCES: PlanSetupExperience[] = ["beginner", "intermediate", "advanced"];

export default function PlanSetupExperienceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { experience, setExperience } = usePlanSetupStore();

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProgressHeader
          step={4}
          onBack={() => router.back()}
          backLabel={t("plan_setup.back")}
          stepLabel={t("plan_setup.step_of", { step: 4 })}
        />

        <View style={styles.header}>
          <View style={styles.coachRow}>
            <View style={styles.coachBadge}>
              <Text style={styles.coachStar}>★</Text>
            </View>
            <Text style={styles.coachLabel}>{t("plan_setup.coach_label")}</Text>
          </View>
          <Text style={styles.title}>{t("plan_setup.experience.title")}</Text>
          <Text style={styles.helper}>{t("plan_setup.experience.helper")}</Text>
        </View>

        <View style={styles.options}>
          {EXPERIENCES.map((value) => (
            <OptionCard
              key={value}
              icon="bar-chart"
              iconBg="transparent"
              iconColor={coachColors.coralPressed}
              title={t(`plan_setup.experience.options.${value}.title`)}
              description={t(`plan_setup.experience.options.${value}.description`)}
              selected={experience === value}
              onPress={() => setExperience(value)}
              accessibilityLabel={
                experience === value
                  ? t("plan_setup.option_selected", { title: t(`plan_setup.experience.options.${value}.title`) })
                  : t(`plan_setup.experience.options.${value}.title`)
              }
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <ContinueButton
          label={t("plan_setup.continue")}
          onPress={() => router.push("/plan-setup/limitations")}
          disabled={!experience}
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
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
});

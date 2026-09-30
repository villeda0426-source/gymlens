// Plan setup step 5 of 5 — "Anything I should work around?" (Body.png).
// This step both drives the safety triage (shared/planSetupTriage.ts) and
// replaces the old physician-clearance chat gate everywhere else.
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import ProgressHeader from "@/components/PlanSetup/ProgressHeader";
import Chip from "@/components/PlanSetup/Chip";
import ContinueButton from "@/components/PlanSetup/ContinueButton";
import ConsentSheet from "@/components/PlanSetup/ConsentSheet";
import SafetyStopCard from "@/components/PlanSetup/SafetyStopCard";
import { coachColors, coachFonts } from "@/constants/theme";
import { usePlanSetupStore } from "@/store/planSetupStore";
import { useAuthStore } from "@/store/authStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { supabase } from "@/lib/supabase";
import { LIMITATION_CHIPS, triagePlanSetup, type LimitationChip } from "@/shared/planSetupTriage";

export default function PlanSetupLimitationsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const { units } = useCoachTrainerStore();
  const language = i18n.language?.startsWith("es") ? "es" : "en";

  const {
    limitations,
    limitationArea,
    chestPainCleared,
    consentGranted,
    setLimitations,
    setLimitationArea,
    setChestPainCleared,
    setConsentGranted,
    submit,
  } = usePlanSetupStore();

  const [showConsentSheet, setShowConsentSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const triage = useMemo(
    () => (chestPainCleared ? triagePlanSetup(limitations.filter((c) => c !== "chest_pain_or_dizziness")) : triagePlanSetup(limitations)),
    [limitations, chestPainCleared]
  );

  const nothingSelected = limitations.length === 0;

  const selectNothing = () => {
    Haptics.selectionAsync().catch(() => {});
    setLimitations([]);
    setLimitationArea("");
    setChestPainCleared(false);
    setConsentGranted(null);
  };

  const toggleChip = (chip: LimitationChip) => {
    Haptics.selectionAsync().catch(() => {});
    const isSelected = limitations.includes(chip);
    const next = isSelected ? limitations.filter((c) => c !== chip) : [...limitations, chip];
    setLimitations(next);

    if (chip === "chest_pain_or_dizziness" && !isSelected) {
      setChestPainCleared(false);
      return;
    }

    // First non-"nothing" selection this visit: ask for consent once.
    if (!isSelected && chip !== "chest_pain_or_dizziness" && consentGranted === null) {
      setShowConsentSheet(true);
    }
  };

  const handleClearedByDoctor = () => {
    // Actually drop the chip (not just a flag) so the chip grid the person
    // returns to doesn't show it as still selected.
    const remaining = limitations.filter((c) => c !== "chest_pain_or_dizziness");
    setLimitations(remaining);
    setChestPainCleared(true);
    if (remaining.length > 0 && consentGranted === null) setShowConsentSheet(true);
  };

  const handleBuildPlan = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || !user) {
      setSubmitError(t("plan_setup.limitations.session_expired"));
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    // submit() sets buildStatus to "building" synchronously before its first
    // await, so calling it before navigating (rather than after) means
    // ready.tsx never has a tick to render a stale status left over from an
    // earlier build (e.g. "ready" from a previous "Rebuild my plan" run).
    const pending = submit({ authToken: session.access_token, language, units });
    router.push("/plan-setup/ready");
    try {
      await pending;
    } catch {
      // ready.tsx reads buildStatus/buildError from the store and renders
      // the retry state; nothing else to do here.
    } finally {
      setSubmitting(false);
    }
  };

  if (triage.kind === "blocked") {
    return (
      <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ProgressHeader
            step={5}
            onBack={() => router.back()}
            backLabel={t("plan_setup.back")}
            stepLabel={t("plan_setup.step_of", { step: 5 })}
          />
          <SafetyStopCard onClearedByDoctor={handleClearedByDoctor} />
        </ScrollView>
      </SafeScreen>
    );
  }

  const canContinue = nothingSelected || consentGranted !== null;

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ProgressHeader
          step={5}
          onBack={() => router.back()}
          backLabel={t("plan_setup.back")}
          stepLabel={t("plan_setup.step_of", { step: 5 })}
        />

        <View style={styles.header}>
          <View style={styles.coachRow}>
            <View style={styles.coachBadge}>
              <Text style={styles.coachStar}>★</Text>
            </View>
            <Text style={styles.coachLabel}>{t("plan_setup.coach_label")}</Text>
          </View>
          <Text style={styles.title}>{t("plan_setup.limitations.title")}</Text>
          <Text style={styles.helper}>{t("plan_setup.limitations.helper")}</Text>
        </View>

        <Pressable
          onPress={selectNothing}
          style={[styles.nothingCard, nothingSelected && styles.nothingCardSelected]}
          accessibilityRole="button"
          accessibilityState={{ selected: nothingSelected }}
          accessibilityLabel={
            nothingSelected
              ? t("plan_setup.option_selected", { title: t("plan_setup.limitations.nothing") })
              : t("plan_setup.limitations.nothing")
          }
        >
          <View style={[styles.nothingCheck, nothingSelected && styles.nothingCheckSelected]}>
            {nothingSelected ? <Ionicons name="checkmark" size={14} color={coachColors.card} /> : null}
          </View>
          <Text style={styles.nothingText}>{t("plan_setup.limitations.nothing")}</Text>
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>{t("plan_setup.limitations.or")}</Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.chipGrid}>
          {LIMITATION_CHIPS.map((chip) => (
            <Chip
              key={chip}
              label={t(`plan_setup.limitations.chips.${chip}`)}
              selected={limitations.includes(chip)}
              onPress={() => toggleChip(chip)}
              accessibilityLabel={
                limitations.includes(chip)
                  ? t("plan_setup.option_selected", { title: t(`plan_setup.limitations.chips.${chip}`) })
                  : t(`plan_setup.limitations.chips.${chip}`)
              }
            />
          ))}
        </View>

        {triage.kind === "needs_area_followup" && consentGranted === true ? (
          <View style={styles.areaField}>
            <Text style={styles.areaLabel}>{t("plan_setup.limitations.area_label")}</Text>
            <TextInput
              value={limitationArea}
              onChangeText={setLimitationArea}
              placeholder={t("plan_setup.limitations.area_placeholder")}
              placeholderTextColor={coachColors.textSecondary}
              style={styles.areaInput}
              accessibilityLabel={t("plan_setup.limitations.area_label")}
            />
          </View>
        ) : null}

        <Text style={styles.disclaimer}>{t("plan_setup.limitations.disclaimer")}</Text>
        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <ContinueButton
          label={t("plan_setup.build_my_plan")}
          onPress={handleBuildPlan}
          disabled={!canContinue}
          loading={submitting}
        />
      </View>

      <ConsentSheet
        visible={showConsentSheet}
        onAllow={() => {
          setConsentGranted(true);
          setShowConsentSheet(false);
        }}
        onNotNow={() => {
          setConsentGranted(false);
          setShowConsentSheet(false);
        }}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: coachColors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 16, paddingBottom: 24 },
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
  nothingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 16,
    backgroundColor: coachColors.card,
    borderWidth: 2,
    borderColor: "transparent",
  },
  nothingCardSelected: { borderColor: coachColors.coachNavy },
  nothingCheck: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: coachColors.border, alignItems: "center", justifyContent: "center" },
  nothingCheckSelected: { backgroundColor: coachColors.coachNavy, borderColor: coachColors.coachNavy },
  nothingText: { flex: 1, fontFamily: coachFonts.heading, fontSize: 18, color: coachColors.text },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: coachColors.border },
  orText: { fontFamily: coachFonts.bodyBold, fontSize: 13, color: coachColors.textSecondary },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  areaField: { gap: 8 },
  areaLabel: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.text },
  areaInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    paddingHorizontal: 14,
    fontFamily: coachFonts.body,
    fontSize: 15,
    color: coachColors.text,
  },
  disclaimer: { fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19, color: coachColors.textSecondary },
  error: { fontFamily: coachFonts.bodyBold, fontSize: 13, color: coachColors.coralPressed },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
});

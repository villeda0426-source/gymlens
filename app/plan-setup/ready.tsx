// Plan setup final screen — "Your plan is ready" (Ready.png). Reached right
// after tapping "Build my plan" on step 5; shows a building state while the
// job runs, then the finished Week 1 preview.
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { coachColors, coachFonts } from "@/constants/theme";
import { usePlanSetupStore } from "@/store/planSetupStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import CoachIcon from "@/components/Coach/CoachIcon";
import PlanOptionCards from "@/components/Coach/PlanOptionCards";
import { adjustPlanOption, type PlanOption } from "@/lib/planOptions";
import { buildPlanSequence } from "@/lib/planSequence";

export default function PlanSetupReadyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const { units } = useCoachTrainerStore();
  const { buildStatus, buildError, submit, options, chooseOption, replaceOption } = usePlanSetupStore();
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState("");
  const plan = useCoachTrainerStore((state) => state.plan);
  const profile = useAuthStore((state) => state.profile);
  const language = i18n.language?.startsWith("es") ? "es" : "en";
  const [safetyNoteDismissed, setSafetyNoteDismissed] = useState(false);

  const exitTo = (href: Parameters<typeof router.push>[0]) => {
    router.dismissAll();
    router.push(href);
  };

  const retry = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token || !user) return;
    try {
      await submit({ authToken: session.access_token, language, units });
    } catch {
      // buildStatus/buildError already updated by submit(); nothing else to do.
    }
  };

  if (buildStatus === "building" || buildStatus === "idle") {
    return (
      <SafeScreen edges={["top", "bottom"]} style={styles.loadingScreen}>
        <ActivityIndicator color={coachColors.coachGold} size="large" />
        <Text style={styles.loadingText}>{t("plan_setup.ready.building")}</Text>
      </SafeScreen>
    );
  }

  const handleAdjust = async (option: PlanOption, instructions: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setAdjustingId(option.id);
    setAdjustError("");
    try {
      replaceOption(await adjustPlanOption({ option, instructions, units, language, authToken: session.access_token }));
    } catch {
      setAdjustError(t("plan_options.adjust_failed"));
    } finally {
      setAdjustingId(null);
    }
  };

  // Two options built: nothing is saved until one is picked.
  if (buildStatus === "ready" && options && options.length > 0) {
    return (
      <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chooseContent}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroRowDark}>
            <CoachIcon size={22} badgeSize={30} />
            <Text style={styles.chooseEyebrow}>{t("plan_setup.coach_label")}</Text>
          </View>
          <Text style={styles.chooseTitle}>{t("plan_options.choose_title")}</Text>
          <Text style={styles.chooseHelper}>{t("plan_options.choose_helper")}</Text>
          <PlanOptionCards
            options={options}
            kind="plan"
            onChoose={chooseOption}
            onAdjust={handleAdjust}
            adjustingId={adjustingId}
          />
          {adjustError ? <Text style={styles.adjustError}>{adjustError}</Text> : null}
        </ScrollView>
      </SafeScreen>
    );
  }

  if (buildStatus === "error" || !plan) {
    return (
      <SafeScreen edges={["top", "bottom"]} style={styles.loadingScreen}>
        <Text style={styles.errorTitle}>{t("plan_setup.ready.error_title")}</Text>
        <Text style={styles.errorBody}>{buildError || t("plan_setup.ready.error_body")}</Text>
        <Pressable style={styles.retryButton} onPress={retry} accessibilityRole="button" accessibilityLabel={t("plan_setup.ready.retry")}>
          <Text style={styles.retryText}>{t("plan_setup.ready.retry")}</Text>
        </Pressable>
      </SafeScreen>
    );
  }

  const week1 = plan.sessions.slice(0, Math.max(1, plan.days_per_week));
  const week1Sequence = buildPlanSequence({ plan, completedExerciseIds: [], sessionCompletedAt: [] }).filter(
    (item) => item.week === 1
  );

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <View style={styles.heroRow}>
            <CoachIcon size={24} badgeSize={32} />
            <Text style={styles.heroEyebrow}>
              {profile?.display_name || profile?.username
                ? t("plan_setup.ready.hero_greeting_named", { name: profile.display_name || profile.username })
                : t("plan_setup.ready.hero_greeting")}
            </Text>
          </View>
          <Text style={styles.heroTitle}>{plan.goal || t("plan_setup.ready.plan_name_fallback")}</Text>
          <View style={styles.chipsRow}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t("plan_setup.ready.chip_days", { count: plan.timeline_weeks * 7 })}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t("plan_setup.ready.chip_frequency", { count: plan.days_per_week })}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{t("plan_setup.ready.chip_minutes", { minutes: week1[0]?.estimated_minutes ?? 45 })}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{plan.equipment[0] || plan.split}</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.weekLabel}>{t("plan_setup.ready.week_1")}</Text>
          <View style={styles.sessionList}>
            {week1Sequence.map((item, index) =>
              item.type === "workout" ? (
                <View key={item.key} style={[styles.sessionRow, index > 0 && styles.sessionRowBorder]}>
                  <Text style={styles.sessionDay}>{t("plan.workout_number", { number: item.number })}</Text>
                  <Text style={styles.sessionFocus}>{item.session.focus}</Text>
                  <Text style={styles.sessionMoves}>{t("plan_setup.ready.moves_count", { count: item.session.exercises.length })}</Text>
                </View>
              ) : (
                <View key={item.key} style={[styles.sessionRow, index > 0 && styles.sessionRowBorder]}>
                  <Ionicons name="moon-outline" size={16} color={coachColors.limeText} style={styles.restIcon} />
                  <Text style={[styles.sessionFocus, styles.restLabel]}>{t("plan.rest_day")}</Text>
                </View>
              )
            )}
          </View>

          {plan.weekly_notes ? (
            <View style={styles.tipRow}>
              <CoachIcon size={18} style={styles.tipIcon} />
              <Text style={styles.tipText}>{plan.weekly_notes}</Text>
            </View>
          ) : null}

          {plan.safety_flags.length > 0 && !safetyNoteDismissed ? (
            <View style={styles.safetyNote}>
              <Ionicons name="medkit-outline" size={16} color={coachColors.amberIcon} />
              <Text style={styles.safetyNoteText}>{plan.safety_flags[0]}</Text>
              <Pressable
                onPress={() => setSafetyNoteDismissed(true)}
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color={coachColors.amberIcon} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.startButton} onPress={() => exitTo("/workout-session")} accessibilityRole="button" accessibilityLabel={t("plan_setup.ready.start_day_1")}>
          <Text style={styles.startButtonText}>{t("plan_setup.ready.start_day_1")}</Text>
        </Pressable>
        <Pressable style={styles.tweakButton} onPress={() => exitTo("/trainer")} accessibilityRole="button" accessibilityLabel={t("plan_setup.ready.tweak_with_coach")}>
          <Text style={styles.tweakButtonText}>{t("plan_setup.ready.tweak_with_coach")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: coachColors.bg },
  loadingScreen: { alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 28, backgroundColor: coachColors.bg },
  loadingText: { fontFamily: coachFonts.bodyBold, fontSize: 15, color: coachColors.textSecondary },
  errorTitle: { fontFamily: coachFonts.heading, fontSize: 24, color: coachColors.text, textAlign: "center" },
  errorBody: { fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21, color: coachColors.textSecondary, textAlign: "center" },
  retryButton: { marginTop: 8, height: 52, paddingHorizontal: 24, borderRadius: 999, backgroundColor: coachColors.coralPressed, alignItems: "center", justifyContent: "center" },
  retryText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
  scrollContent: { paddingBottom: 24 },
  hero: {
    backgroundColor: coachColors.coachNavy,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 28,
    gap: 14,
  },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroEyebrow: { color: "rgba(255,255,255,0.85)", fontFamily: coachFonts.bodyBold, fontSize: 15 },
  heroTitle: { color: coachColors.card, fontFamily: coachFonts.heading, fontSize: 34, lineHeight: 38 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: coachColors.card, fontFamily: coachFonts.bodyBold, fontSize: 13 },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 14 },
  weekLabel: { fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1, color: coachColors.textSecondary, textTransform: "uppercase" },
  sessionList: { backgroundColor: coachColors.card, borderRadius: 20, paddingHorizontal: 16 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 },
  sessionRowBorder: { borderTopWidth: 1, borderTopColor: coachColors.border },
  sessionDay: { width: 84, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, color: coachColors.coralPressed },
  sessionFocus: { flex: 1, fontFamily: coachFonts.headingSemiBold, fontSize: 17, color: coachColors.text },
  sessionMoves: { fontFamily: coachFonts.body, fontSize: 13, color: coachColors.textSecondary },
  tipRow: { flexDirection: "row", gap: 8 },
  tipIcon: { marginTop: 1 },
  tipText: { flex: 1, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21, color: coachColors.text },
  safetyNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fff3e0",
    borderRadius: 14,
    padding: 12,
  },
  safetyNoteText: { flex: 1, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19, color: coachColors.amberText },
  chooseContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 12 },
  heroRowDark: { flexDirection: "row", alignItems: "center", gap: 10 },
  chooseEyebrow: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.textSecondary },
  chooseTitle: { fontFamily: coachFonts.heading, fontSize: 30, lineHeight: 35, color: coachColors.text },
  chooseHelper: { fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21, color: coachColors.textSecondary, marginBottom: 4 },
  adjustError: { fontFamily: coachFonts.bodyBold, fontSize: 13, color: coachColors.coralPressed },
  restIcon: { width: 84 },
  restLabel: { color: coachColors.limeText },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 10, backgroundColor: coachColors.bg },
  startButton: { height: 56, borderRadius: 999, backgroundColor: coachColors.coralPressed, alignItems: "center", justifyContent: "center" },
  startButtonText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 18 },
  tweakButton: { height: 56, borderRadius: 999, borderWidth: 1.5, borderColor: coachColors.border, alignItems: "center", justifyContent: "center" },
  tweakButtonText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 16 },
});

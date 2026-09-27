// Coach Forward Home — Phase 5.
//
// Restructured to the mockup's order: greeting header -> Coach message
// card -> Today card -> dark Scan tile. The existing workout-search card,
// tip-of-the-day, and quick row aren't in the mockup, so per the Phase 5
// plan they're kept (re-skinned to the new tokens) below the fold. The old
// hero card (SpotLift wordmark + exercises_done/training_days stats) and
// the Talk-to-Coach/Weekly-Plan action grid are dropped: the wordmark isn't
// in the mockup's home header, and their jobs are now covered by the Coach
// card, the Today card, and the tab bar.
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import { useWorkoutGuideStore } from "@/store/workoutGuideStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { coachColors, coachDark, coachFonts, radii, spacing } from "@/constants/theme";
import { apiFetch } from "@/lib/api";
import { ReliableSession } from "@/shared/reliableCoach";

function getTodaysTip(t: (key: string) => string): string {
  return t(`home.tips.${new Date().getDay()}`);
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { setCurrentGuide } = useWorkoutGuideStore();
  const {
    plan,
    hasLoaded,
    loadTrainer,
    completedExerciseIds,
    pendingPlanChange,
    applyPendingPlanChange,
  } = useCoachTrainerStore();
  const [workoutQuery, setWorkoutQuery] = useState("");
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutMessage, setWorkoutMessage] = useState("");
  const [justApplied, setJustApplied] = useState(false);

  useEffect(() => {
    loadTrainer();
  }, [loadTrainer]);

  const handleWorkoutSearch = async () => {
    const query = workoutQuery.trim();
    if (!query) {
      setWorkoutMessage(t("home.type_exercise_first"));
      return;
    }

    setWorkoutLoading(true);
    setWorkoutMessage("");

    try {
      const data = await apiFetch("/api/workout-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, language: i18n.language?.startsWith("es") ? "es" : "en" }),
      }, 30000);

      setCurrentGuide(data);
      router.push("/equipment/workout-result");
    } catch (error: any) {
      setWorkoutMessage(error?.message || t("home.workout_search_unavailable"));
    } finally {
      setWorkoutLoading(false);
    }
  };

  const handleApplyPendingPlanChange = () => {
    applyPendingPlanChange();
    setJustApplied(true);
  };

  const displayName = profile?.username?.split(" ")[0];
  const initial = (profile?.username?.trim()?.[0] ?? "?").toUpperCase();
  const dateLabel = new Date()
    .toLocaleDateString(i18n.language?.startsWith("es") ? "es" : "en", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();

  const todayBaseSession = (plan?.sessions?.[0] as ReliableSession | undefined) ?? null;
  const totalExercises = plan?.sessions.reduce((sum, session) => sum + session.exercises.length, 0) ?? 0;
  const todaySets = todayBaseSession?.exercises.reduce((sum, exercise) => sum + exercise.sets, 0) ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.dateLabel}>{dateLabel}</Text>
            <Text style={styles.readyGreeting}>
              {displayName ? t("home.ready_greeting", { name: displayName }) : t("home.ready_greeting_generic")}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push("/(tabs)/profile")}
            accessibilityRole="button"
            accessibilityLabel={t("home.my_profile").replace("\n", " ")}
          >
            <Text style={styles.profileButtonText}>{initial}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.coachCard}
          activeOpacity={0.9}
          onPress={() => router.push("/trainer")}
        >
          <View style={styles.coachCardHeader}>
            <View style={styles.coachCardIcon}>
              <Ionicons name="star" size={18} color={coachColors.coachGold} />
            </View>
            <Text style={styles.coachCardTitle}>{t("trainer.coach_header_title")}</Text>
            {pendingPlanChange && !justApplied ? (
              <View style={styles.coachCardBadge}>
                <Text style={styles.coachCardBadgeText}>{t("home.coach_card_badge")}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.coachCardBody}>
            {justApplied
              ? t("home.coach_card_applied")
              : pendingPlanChange
                ? pendingPlanChange.summary
                : plan
                  ? plan.weekly_notes || t("home.coach_card_has_plan_body")
                  : t("home.coach_card_no_plan_body")}
          </Text>

          <View style={styles.coachCardActions}>
            {pendingPlanChange && !justApplied ? (
              <TouchableOpacity
                style={styles.coachCardPrimaryPill}
                onPress={(event) => {
                  event.stopPropagation();
                  handleApplyPendingPlanChange();
                }}
              >
                <Text style={styles.coachCardPrimaryPillText}>{t("home.coach_card_apply")}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.coachCardSecondaryPill}>
              <Text style={styles.coachCardSecondaryPillText}>{t("home.coach_card_talk")}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.todayCard}>
          {todayBaseSession ? (
            <>
              <Text style={styles.todayEyebrow}>{t("home.today_eyebrow")}</Text>
              <Text style={styles.todayTitle}>{todayBaseSession.focus}</Text>
              <View style={styles.todayStatsRow}>
                <View style={styles.todayStat}>
                  <Text style={styles.todayStatValue}>{todayBaseSession.exercises.length}</Text>
                  <Text style={styles.todayStatLabel}>{t("home.today_exercises")}</Text>
                </View>
                <View style={styles.todayStat}>
                  <Text style={styles.todayStatValue}>{todaySets}</Text>
                  <Text style={styles.todayStatLabel}>{t("home.today_sets")}</Text>
                </View>
                <View style={styles.todayStat}>
                  <Text style={styles.todayStatValue}>{todayBaseSession.estimated_minutes}</Text>
                  <Text style={styles.todayStatLabel}>{t("home.today_minutes")}</Text>
                </View>
              </View>
              {totalExercises > 0 ? (
                <Text style={styles.todayProgress}>
                  {t("home.today_progress", { done: completedExerciseIds.length, total: totalExercises })}
                </Text>
              ) : null}
              <TouchableOpacity style={styles.startWorkoutButton} onPress={() => router.push("/plan")}>
                <Ionicons name="play" size={16} color={coachColors.card} />
                <Text style={styles.startWorkoutText}>{t("home.start_workout")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.todayCardNoPlanTitle}>{t("home.today_card_no_plan_title")}</Text>
              <Text style={styles.todayCardNoPlanBody}>{t("home.today_card_no_plan_body")}</Text>
              <TouchableOpacity style={styles.startWorkoutButton} onPress={() => router.push("/trainer")}>
                <Text style={styles.startWorkoutText}>{t("home.today_card_build_plan")}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.scanTile}
          activeOpacity={0.88}
          onPress={() => router.push("/(tabs)/scan")}
        >
          <View style={styles.scanTileViewfinder}>
            <View style={[styles.scanCorner, styles.scanCornerTL]} />
            <View style={[styles.scanCorner, styles.scanCornerTR]} />
            <View style={[styles.scanCorner, styles.scanCornerBL]} />
            <View style={[styles.scanCorner, styles.scanCornerBR]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTileTitle}>{t("home.scan_tile_title")}</Text>
            <Text style={styles.scanTileSubtitle}>{t("home.scan_tile_subtitle")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={coachDark.textSecondary} />
        </TouchableOpacity>

        {/* Below the fold: not part of the Coach Forward mockup, kept and
            re-skinned per the Phase 5 plan. */}
        <View style={styles.workoutSearch}>
          <View style={styles.cardHeadingRow}>
            <View>
              <Text style={styles.cardEyebrow}>{t("home.exercise_guide")}</Text>
              <Text style={styles.workoutTitle}>{t("home.search_workout")}</Text>
            </View>
            <Ionicons name="search" size={20} color={coachColors.coral} />
          </View>
          <View style={styles.searchRow}>
            <TextInput
              value={workoutQuery}
              onChangeText={(text) => {
                setWorkoutQuery(text);
                if (workoutMessage) setWorkoutMessage("");
              }}
              onSubmitEditing={handleWorkoutSearch}
              placeholder={t("home.search_workout_placeholder")}
              placeholderTextColor={coachColors.textSecondary}
              returnKeyType="search"
              autoCapitalize="words"
              autoCorrect
              style={styles.workoutInput}
            />
            <TouchableOpacity
              style={[styles.searchButton, workoutLoading && styles.searchButtonDisabled]}
              onPress={handleWorkoutSearch}
              activeOpacity={0.85}
              disabled={workoutLoading}
            >
              {workoutLoading ? (
                <ActivityIndicator color={coachColors.card} size="small" />
              ) : (
                <Ionicons name="sparkles" size={20} color={coachColors.card} />
              )}
            </TouchableOpacity>
          </View>

          {workoutMessage ? (
            <Text style={styles.workoutMessage}>{workoutMessage}</Text>
          ) : null}
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <View style={styles.tipBadge}>
              <Text style={styles.tipBadgeText}>{t("home.todays_tip")}</Text>
            </View>
            <Ionicons name="bulb-outline" size={20} color={coachColors.lime} />
          </View>
          <Text style={styles.tipText}>{getTodaysTip(t)}</Text>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/scan")}
            activeOpacity={0.85}
          >
            <Ionicons name="scan" size={22} color={coachColors.coral} />
            <Text style={styles.quickLabel}>{t("home.identify_equipment")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/plan")}
            activeOpacity={0.85}
          >
            <Ionicons name="body" size={22} color={coachColors.coral} />
            <Text style={styles.quickLabel}>{t("home.avatar")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/profile")}
            activeOpacity={0.85}
          >
            <Ionicons name="person" size={22} color={coachColors.coral} />
            <Text style={styles.quickLabel}>{t("home.my_profile")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: coachColors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 32, gap: spacing.lg },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dateLabel: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold, fontSize: 13, letterSpacing: 1.4 },
  readyGreeting: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 30, marginTop: 2 },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: "#e7e3da",
    alignItems: "center",
    justifyContent: "center",
  },
  profileButtonText: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 17 },

  coachCard: {
    backgroundColor: coachColors.coachNavy,
    borderRadius: radii.cardLarge,
    padding: spacing.lg,
    gap: spacing.md,
  },
  coachCardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  coachCardIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: "#1b3a61",
    alignItems: "center",
    justifyContent: "center",
  },
  coachCardTitle: { flex: 1, color: coachColors.card, fontFamily: coachFonts.headingSemiBold, fontSize: 16 },
  coachCardBadge: { backgroundColor: coachColors.coachGold, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4 },
  coachCardBadgeText: { color: coachColors.coachNavy, fontFamily: coachFonts.bodyBold, fontSize: 12 },
  coachCardBody: { color: coachColors.card, fontFamily: coachFonts.body, fontSize: 16, lineHeight: 23 },
  coachCardActions: { flexDirection: "row", gap: spacing.sm },
  coachCardPrimaryPill: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  coachCardPrimaryPillText: { color: coachColors.coachNavy, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  coachCardSecondaryPill: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  coachCardSecondaryPillText: { color: coachColors.card, fontFamily: coachFonts.bodyBold, fontSize: 14 },

  todayCard: {
    backgroundColor: coachColors.card,
    borderRadius: radii.cardLarge,
    padding: spacing.lg,
    gap: spacing.md,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: { boxShadow: "0 1px 2px rgba(12,35,64,0.06), 0 8px 20px rgba(12,35,64,0.05)" },
    }),
  },
  todayEyebrow: { color: coachColors.coral, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.4 },
  todayTitle: { color: coachColors.text, fontFamily: coachFonts.headingExtraBold, fontSize: 40, letterSpacing: -0.5 },
  todayStatsRow: { flexDirection: "row", gap: spacing.lg },
  todayStat: { gap: 2 },
  todayStatValue: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 24 },
  todayStatLabel: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  todayProgress: { color: coachColors.limeText, fontFamily: coachFonts.bodyBold, fontSize: 12, letterSpacing: 1 },
  startWorkoutButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  startWorkoutText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 17 },
  todayCardNoPlanTitle: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 22 },
  todayCardNoPlanBody: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 14, lineHeight: 20 },

  scanTile: {
    minHeight: 76,
    borderRadius: radii.cardLarge,
    backgroundColor: coachDark.bg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  scanTileViewfinder: { width: 44, height: 44, flexShrink: 0 },
  scanCorner: { position: "absolute", width: 13, height: 13, borderColor: coachDark.limeOnDark },
  scanCornerTL: { left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3 },
  scanCornerTR: { right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3 },
  scanCornerBL: { left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
  scanCornerBR: { right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  scanTileTitle: { color: coachDark.text, fontFamily: coachFonts.headingSemiBold, fontSize: 18 },
  scanTileSubtitle: { color: coachDark.textSecondary, fontFamily: coachFonts.body, fontSize: 14, marginTop: 2 },

  workoutSearch: {
    backgroundColor: coachColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: coachColors.border,
    padding: 16,
  },
  cardHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardEyebrow: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, textTransform: "uppercase" },
  workoutTitle: { fontSize: 22, fontFamily: coachFonts.heading, color: coachColors.text, marginTop: 2 },
  searchRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  workoutInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.bg,
    paddingHorizontal: 14,
    color: coachColors.text,
    fontSize: 15,
    fontFamily: coachFonts.body,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: coachColors.coral,
  },
  searchButtonDisabled: { opacity: 0.7 },
  workoutMessage: {
    marginTop: 10,
    color: coachColors.textSecondary,
    fontSize: 13,
    fontFamily: coachFonts.body,
    lineHeight: 19,
  },

  tipCard: {
    backgroundColor: coachColors.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  tipBadge: {
    backgroundColor: coachColors.lime + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: coachColors.lime + "40",
  },
  tipBadgeText: { color: coachColors.limeText, fontSize: 11, fontFamily: coachFonts.bodyBold },
  tipText: { color: coachColors.text, fontSize: 14, fontFamily: coachFonts.body, lineHeight: 22 },

  quickRow: { flexDirection: "row", gap: 12 },
  quickCard: {
    flex: 1,
    backgroundColor: coachColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.border,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  quickLabel: {
    color: coachColors.text,
    fontSize: 11,
    fontFamily: coachFonts.bodySemiBold,
    textAlign: "center",
    lineHeight: 16,
  },
});

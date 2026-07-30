import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/authStore";
import { useWorkoutGuideStore } from "@/store/workoutGuideStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { colors, fonts } from "@/constants/theme";
import { apiFetch } from "@/lib/api";

function getGreeting(t: (key: string) => string, name?: string): string {
  const hour = new Date().getHours();
  const baseKey = hour < 12 ? "home.good_morning" : hour < 17 ? "home.good_afternoon" : "home.good_evening";
  const base = t(baseKey);
  return name ? `${base}, ${name.split(" ")[0]} 👋` : `${base} 👋`;
}

function getTodaysTip(t: (key: string) => string): string {
  return t(`home.tips.${new Date().getDay()}`);
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { setCurrentGuide } = useWorkoutGuideStore();
  const { plan, hasLoaded, loadTrainer, completedExerciseIds } = useCoachTrainerStore();
  const [workoutQuery, setWorkoutQuery] = useState("");
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutMessage, setWorkoutMessage] = useState("");

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
        body: JSON.stringify({ query }),
      }, 30000);

      setCurrentGuide(data);
      router.push("/equipment/workout-result");
    } catch (error: any) {
      setWorkoutMessage(error?.message || t("home.workout_search_unavailable"));
    } finally {
      setWorkoutLoading(false);
    }
  };

  const displayName = profile?.username || undefined;
  const totalExercises = plan?.sessions.reduce((sum, session) => sum + session.exercises.length, 0) ?? 0;
  const completionLabel = totalExercises > 0 ? `${completedExerciseIds.length}/${totalExercises}` : t("home.no_plan");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.workoutSearch}>
          <View style={styles.cardHeadingRow}>
            <View>
              <Text style={styles.cardEyebrow}>{t("home.exercise_guide")}</Text>
              <Text style={styles.workoutTitle}>{t("home.search_workout")}</Text>
            </View>
            <Ionicons name="search" size={20} color={colors.coral} />
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
              placeholderTextColor={colors.textMuted}
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
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons name="sparkles" size={20} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>

          {workoutMessage ? (
            <Text style={styles.workoutMessage}>{workoutMessage}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.scanHero}
          activeOpacity={0.88}
          onPress={() => router.push("/(tabs)/scan")}
        >
          <View style={styles.scanHeroIcon}>
            <Ionicons name="camera" size={25} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanHeroTitle}>{t("home.camera_scan_title")}</Text>
            <Text style={styles.scanHeroText}>{t("home.camera_scan_text")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.white} style={{ opacity: 0.72 }} />
        </TouchableOpacity>

        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <View style={styles.tipBadge}>
              <Text style={styles.tipBadgeText}>{t("home.todays_tip")}</Text>
            </View>
            <Ionicons name="bulb-outline" size={20} color={colors.lime} />
          </View>
          <Text style={styles.tipText}>{getTodaysTip(t)}</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.greeting}>{getGreeting(t, displayName).replace("👋", "").trim()}</Text>
              <View style={styles.logoRow}>
                <Image
                  source={require("@/assets/images/spotlift-mark.png")}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <Text style={styles.logo}>
                  Spot<Text style={styles.logoAccent}>lift</Text>
                </Text>
              </View>
            </View>
            <View style={styles.memberBadge}>
              <Ionicons name="flash" size={15} color={colors.white} />
            </View>
          </View>
          <Text style={styles.heroTitle}>{t("home.hero_title")}</Text>
          <Text style={styles.heroText}>{t("home.hero_text")}</Text>

          <View style={styles.heroStats}>
            <TouchableOpacity style={styles.heroStat} onPress={() => router.push("/plan")}>
              <Text style={styles.heroStatValue}>{completionLabel}</Text>
              <Text style={styles.heroStatLabel}>{t("home.exercises_done")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroStat} onPress={() => router.push("/trainer")}>
              <Text style={styles.heroStatValue}>{plan ? plan.days_per_week : "--"}</Text>
              <Text style={styles.heroStatLabel}>{t("home.training_days")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.primaryAction} activeOpacity={0.88} onPress={() => router.push("/trainer")}>
            <View style={styles.primaryActionIcon}>
              <Ionicons name="chatbubbles" size={24} color={colors.white} />
            </View>
            <Text style={styles.primaryActionTitle}>{t("home.talk_to_coach")}</Text>
            <Text style={styles.primaryActionText}>{t("home.coach_action_text")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryAction} activeOpacity={0.88} onPress={() => router.push("/plan")}>
            <View style={styles.secondaryActionIcon}>
              <Ionicons name="calendar" size={22} color={colors.coral} />
            </View>
            <Text style={styles.secondaryActionTitle}>{t("home.weekly_plan")}</Text>
            <Text style={styles.secondaryActionText}>
              {hasLoaded && plan ? t("home.view_workouts_avatar") : t("home.build_with_coach")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/scan")}
            activeOpacity={0.85}
          >
            <Ionicons name="scan" size={22} color={colors.coral} />
            <Text style={styles.quickLabel}>{t("home.identify_equipment")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/plan")}
            activeOpacity={0.85}
          >
            <Ionicons name="body" size={22} color={colors.coral} />
            <Text style={styles.quickLabel}>{t("home.avatar")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/profile")}
            activeOpacity={0.85}
          >
            <Ionicons name="person" size={22} color={colors.coral} />
            <Text style={styles.quickLabel}>{t("home.my_profile")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },

  hero: {
    marginTop: 12,
    marginBottom: 18,
    borderRadius: 24,
    backgroundColor: colors.text,
    padding: 20,
    overflow: "hidden",
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  greeting: { fontSize: 13, fontFamily: fonts.body, color: "rgba(255,255,255,0.72)", marginBottom: 6 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoImage: { height: 40, width: undefined },
  logo: { fontSize: 32, fontFamily: fonts.heading, color: colors.white },
  logoAccent: { color: colors.coral },
  memberBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: colors.white, fontFamily: fonts.heading, fontSize: 31, lineHeight: 35 },
  heroText: { color: "rgba(255,255,255,0.72)", fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 8 },
  heroStats: { flexDirection: "row", gap: 10, marginTop: 18 },
  heroStat: {
    flex: 1,
    minHeight: 68,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 12,
    justifyContent: "center",
  },
  heroStatValue: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 20 },
  heroStatLabel: { color: "rgba(255,255,255,0.62)", fontFamily: fonts.body, fontSize: 11, marginTop: 2 },

  workoutSearch: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginBottom: 14,
  },
  cardHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardEyebrow: { color: colors.textMuted, fontFamily: fonts.bold, fontSize: 11, textTransform: "uppercase" },
  workoutTitle: { fontSize: 22, fontFamily: fonts.heading, color: colors.text, marginTop: 2 },
  searchRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  workoutInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.input,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.coral,
  },
  searchButtonDisabled: { opacity: 0.7 },
  workoutMessage: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 19,
  },
  scanHero: {
    minHeight: 88,
    borderRadius: 20,
    backgroundColor: colors.coral,
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    shadowColor: colors.coral,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  scanHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanHeroTitle: { color: colors.white, fontFamily: fonts.bold, fontSize: 17 },
  scanHeroText: { color: "rgba(255,255,255,0.78)", fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  actionGrid: { flexDirection: "row", gap: 12, marginBottom: 16 },
  primaryAction: {
    flex: 1.1,
    backgroundColor: colors.coral,
    borderRadius: 20,
    padding: 16,
    minHeight: 154,
    justifyContent: "space-between",
    shadowColor: colors.coral,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  primaryActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionTitle: { color: colors.white, fontFamily: fonts.bold, fontSize: 18 },
  primaryActionText: { color: "rgba(255,255,255,0.78)", fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  secondaryAction: {
    flex: 0.9,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    minHeight: 154,
    justifyContent: "space-between",
  },
  secondaryActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.coral + "14",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 17 },
  secondaryActionText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },

  tipCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 24,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  tipBadge: {
    backgroundColor: colors.lime + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.lime + "40",
  },
  tipBadgeText: { color: colors.lime, fontSize: 11, fontFamily: fonts.bold },
  tipText: { color: colors.text, fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },

  quickRow: { flexDirection: "row", gap: 12 },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  quickLabel: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    textAlign: "center",
    lineHeight: 16,
  },
});

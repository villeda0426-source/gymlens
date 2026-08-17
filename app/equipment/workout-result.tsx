import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Switch } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import MuscleGroupTags from "@/components/Equipment/MuscleGroupTags";
import MuscleMapView from "@/components/Equipment/MuscleMapView";
import DetailTabBar from "@/components/Equipment/DetailTabBar";
import TutorialSteps from "@/components/Equipment/TutorialSteps";
import SafetyTips from "@/components/Equipment/SafetyTips";
import VideoList, { VideoItem } from "@/components/Equipment/VideoList";
import { useWorkoutGuideStore } from "@/store/workoutGuideStore";
import { colors, fonts } from "@/constants/theme";
import { apiFetch } from "@/lib/api";

const TABS = ["tutorial", "safety", "videos", "calculator"] as const;
type TabType = typeof TABS[number];
type Level = "Beginner" | "Intermediate" | "Advanced";

const LEVEL_MULTIPLIERS: Record<Level, number> = { Beginner: 1, Intermediate: 1.35, Advanced: 1.65 };
function estimateLoadFactor(muscles: string[]): number {
  const normalized = muscles.map((muscle) => muscle.toLowerCase());
  if (normalized.some((muscle) => /quad|hamstring|glute|leg|calf/.test(muscle))) return 0.38;
  if (normalized.some((muscle) => /back|lat|trap|pull/.test(muscle))) return 0.3;
  if (normalized.some((muscle) => /chest|shoulder|tricep|push/.test(muscle))) return 0.24;
  if (normalized.some((muscle) => /core|abs|oblique/.test(muscle))) return 0.12;
  return 0.25;
}

export default function WorkoutResultScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { currentGuide } = useWorkoutGuideStore();

  const [activeTab, setActiveTab] = useState<TabType>("tutorial");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosFetched, setVideosFetched] = useState(false);
  const [bodyWeight, setBodyWeight] = useState("");
  const [useLbs, setUseLbs] = useState(true);
  const [level, setLevel] = useState<Level>("Beginner");

  const fetchVideos = async () => {
    if (!currentGuide?.exercise) return;
    setVideosLoading(true);
    try {
      const requestParams = new URLSearchParams({ name: currentGuide.exercise, language: i18n.language?.startsWith("es") ? "es" : "en" });
      const data = await apiFetch<VideoItem[]>(`/api/videos?${requestParams.toString()}`, {}, 15000);
      setVideos(data);
    } catch {
      // Server unavailable — leave videos empty
    } finally {
      setVideosLoading(false);
      setVideosFetched(true);
    }
  };

  useEffect(() => {
    if (activeTab === "videos" && !videosFetched) {
      fetchVideos();
    }
  }, [activeTab]);

  if (!currentGuide) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{t("equipment.could_not_load_workout_guide")}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOutline}>
            <Text style={styles.backButtonOutlineText}>{t("equipment.go_back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeScreen>
    );
  }

  const tutorials = currentGuide.steps.map((instruction, index) => ({
    step: index + 1,
    instruction,
  }));

  const TAB_LABELS: Record<TabType, string> = {
    tutorial: t("equipment.tutorial"),
    safety: t("equipment.safety_short"),
    videos: t("equipment.videos"),
    calculator: t("equipment.calculator"),
  };

  const calcWeight = (): string => {
    const weight = parseFloat(bodyWeight);
    if (!weight) return t("equipment.enter_weight");
    const load = weight * estimateLoadFactor(currentGuide.targetMuscles) * LEVEL_MULTIPLIERS[level];
    return `${Math.max(5, Math.round(load / 5) * 5)} ${useLbs ? "lbs" : "kg"}`;
  };

  return (
    <SafeScreen edges={["top"]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero — muscle diagram */}
        <View style={styles.heroMuscle}>
          <MuscleMapView muscleGroups={currentGuide.targetMuscles} />
        </View>

        <View style={styles.content}>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>{t("equipment.ai_workout_guide")}</Text>
          </View>

          <Text style={styles.name}>{currentGuide.exercise}</Text>

          {currentGuide.targetMuscles.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("equipment.muscle_groups")}</Text>
              <MuscleGroupTags groups={currentGuide.targetMuscles} />
            </View>
          )}

          {/* Tab bar */}
          <DetailTabBar
            tabs={TABS.map((tab) => ({ key: tab, label: TAB_LABELS[tab] }))}
            activeTab={activeTab}
            onChange={(key) => setActiveTab(key as TabType)}
          />

          {activeTab === "tutorial" && (
            <View style={styles.tabContent}>
              <TutorialSteps steps={tutorials} />
            </View>
          )}

          {activeTab === "safety" && (
            <View style={styles.tabContent}>
              <SafetyTips tips={currentGuide.safetyTips} />
            </View>
          )}

          {activeTab === "videos" && (
            <View style={styles.tabContent}>
              <VideoList
                videos={videos}
                loading={videosLoading}
                fetched={videosFetched}
                onRetry={() => {
                  setVideosFetched(false);
                  fetchVideos();
                }}
              />
            </View>
          )}

          {activeTab === "calculator" && (
            <View style={styles.tabContent}>
              <View style={styles.calcCard}>
                <Text style={styles.calcLabel}>{t("equipment.body_weight")}</Text>
                <View style={styles.calcInputRow}>
                  <TextInput
                    style={styles.calcInput}
                    placeholder={t("equipment.body_weight_placeholder")}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={bodyWeight}
                    onChangeText={setBodyWeight}
                  />
                  <View style={styles.unitToggle}>
                    <Text style={[styles.unitText, useLbs && styles.unitActive]}>lbs</Text>
                    <Switch
                      value={!useLbs}
                      onValueChange={(value) => setUseLbs(!value)}
                      trackColor={{ false: colors.coral, true: colors.coral }}
                      thumbColor={colors.white}
                    />
                    <Text style={[styles.unitText, !useLbs && styles.unitActive]}>kg</Text>
                  </View>
                </View>
              </View>

              <View style={styles.calcCard}>
                <Text style={styles.calcLabel}>{t("equipment.experience_level")}</Text>
                <View style={styles.levelRow}>
                  {(["Beginner", "Intermediate", "Advanced"] as const).map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[styles.levelBtn, level === item && styles.levelBtnActive]}
                      onPress={() => setLevel(item)}
                    >
                      <Text style={[styles.levelBtnText, level === item && styles.levelBtnTextActive]}>
                        {t(`equipment.${item.toLowerCase()}`)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.resultsCard}>
                <Text style={styles.resultsTitle}>{t("equipment.suggested_starting_load")}</Text>
                <Text style={styles.resultsWeight}>{calcWeight()}</Text>
                <View style={styles.resultsDivider} />
                <View style={styles.resultRow}>
                  <Text style={styles.resultKey}>{t("equipment.sets_reps")}</Text>
                  <Text style={styles.resultVal}>{t(`equipment.sets_reps_by_level.${level}`)}</Text>
                </View>
                <View style={styles.resultRow}>
                  <Text style={styles.resultKey}>{t("equipment.rest_time")}</Text>
                  <Text style={styles.resultVal}>{t(`equipment.rest_by_level.${level}`)}</Text>
                </View>
                <Text style={styles.calcNote}>
                  {t("equipment.calc_note")}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorText: { color: colors.text, fontSize: 18, fontFamily: fonts.bold, marginBottom: 24, textAlign: "center" },
  backButtonOutline: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  backButtonOutlineText: { color: colors.textSecondary, fontFamily: fonts.bold },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { padding: 8 },
  backIcon: { color: colors.text, fontSize: 32, fontWeight: "300", lineHeight: 32 },
  heroMuscle: {
    backgroundColor: colors.bg,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  content: { padding: 20 },
  aiBadge: {
    backgroundColor: colors.lime + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: "flex-start", marginBottom: 12,
  },
  aiBadgeText: { color: colors.lime, fontSize: 11, fontFamily: fonts.semiBold },
  name: { color: colors.text, fontSize: 28, fontFamily: fonts.heading, marginBottom: 16, lineHeight: 34 },
  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  tabContent: { gap: 12 },
  calcCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  calcLabel: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.bold, textTransform: "uppercase", marginBottom: 10 },
  calcInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  calcInput: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.bold,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  unitToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  unitText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semiBold },
  unitActive: { color: colors.coral, fontFamily: fonts.bold },
  levelRow: { flexDirection: "row", gap: 8 },
  levelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  levelBtnActive: { backgroundColor: colors.coral, borderColor: colors.coral },
  levelBtnText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semiBold },
  levelBtnTextActive: { color: colors.white, fontFamily: fonts.bold },
  resultsCard: {
    backgroundColor: colors.coral + "0d",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.coral + "30",
  },
  resultsTitle: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.bold, textTransform: "uppercase", marginBottom: 8 },
  resultsWeight: { color: colors.coral, fontSize: 38, fontFamily: fonts.heading, marginBottom: 16 },
  resultsDivider: { height: 1, backgroundColor: colors.coral + "30", marginBottom: 16 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  resultKey: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
  resultVal: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
  calcNote: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body, lineHeight: 18, marginTop: 10 },
});

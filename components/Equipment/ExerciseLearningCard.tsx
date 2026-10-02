// Shared exercise-learning content — extracted from
// app/equipment/workout-result.tsx (QA: Workout Log handoff) so the same
// tabbed guide (name/chips, Tutorial, Safety, Videos, Calculator) can be
// reused both in that full-screen guide and embedded below the Workout Log
// set table, without copy-pasting the tab logic. The outer hero/chrome
// (full-bleed muscle map + back button vs. a bordered card) stays specific
// to each caller — only `embedded` changes here, by swapping the hero for a
// small inline muscle map and the sheet styling for a card.
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import MuscleGroupTags from "@/components/Equipment/MuscleGroupTags";
import DetailTabBar from "@/components/Equipment/DetailTabBar";
import TutorialSteps from "@/components/Equipment/TutorialSteps";
import SafetyTips from "@/components/Equipment/SafetyTips";
import VideoList, { VideoItem } from "@/components/Equipment/VideoList";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
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

export interface ExerciseLearningGuide {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
}

interface ExerciseLearningCardProps {
  guide: ExerciseLearningGuide;
  // Card styling (Workout Log) vs. full-bleed sheet styling (the standalone
  // guide screen). Defaults to the sheet look to match the original.
  embedded?: boolean;
}

export default function ExerciseLearningCard({ guide, embedded = false }: ExerciseLearningCardProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("tutorial");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosFetched, setVideosFetched] = useState(false);
  const [bodyWeight, setBodyWeight] = useState("");
  const [useLbs, setUseLbs] = useState(true);
  const [level, setLevel] = useState<Level>("Beginner");

  const fetchVideos = async () => {
    if (!guide.exercise) return;
    setVideosLoading(true);
    try {
      const requestParams = new URLSearchParams({ name: guide.exercise, language: i18n.language?.startsWith("es") ? "es" : "en" });
      const data = await apiFetch<VideoItem[]>(`/api/videos?${requestParams.toString()}`, {}, 15000);
      setVideos(data);
    } catch {
      // Server unavailable — leave videos empty; VideoList's own retry
      // state (passed through below) is how the user tries again.
    } finally {
      setVideosLoading(false);
      setVideosFetched(true);
    }
  };

  useEffect(() => {
    if (activeTab === "videos" && !videosFetched) {
      fetchVideos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // A different exercise's guide replacing this one (e.g. Workout Log stays
  // mounted while its route params change) should reset tab/video state
  // rather than show stale content under a new name.
  useEffect(() => {
    setActiveTab("tutorial");
    setVideos([]);
    setVideosFetched(false);
    setVideosLoading(false);
  }, [guide.exercise]);

  const tutorials = guide.steps.map((instruction, index) => ({ step: index + 1, instruction }));

  const TAB_LABELS: Record<TabType, string> = {
    tutorial: t("equipment.tutorial"),
    safety: t("equipment.safety_short"),
    videos: t("equipment.videos"),
    calculator: t("equipment.calculator"),
  };

  const calcWeight = (): string => {
    const weight = parseFloat(bodyWeight);
    if (!weight) return t("equipment.enter_weight");
    const load = weight * estimateLoadFactor(guide.targetMuscles) * LEVEL_MULTIPLIERS[level];
    return `${Math.max(5, Math.round(load / 5) * 5)} ${useLbs ? "lbs" : "kg"}`;
  };

  return (
    <View style={embedded ? styles.embeddedWrap : undefined}>
      <View style={embedded ? styles.embeddedContent : styles.sheetContent}>
        {!embedded ? (
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>{t("equipment.ai_workout_guide")}</Text>
          </View>
        ) : null}

        <Text style={embedded ? styles.embeddedName : styles.name}>{guide.exercise}</Text>

        {guide.targetMuscles.length > 0 ? (
          <View style={styles.section}>
            {!embedded ? <Text style={styles.sectionTitle}>{t("equipment.muscle_groups")}</Text> : null}
            <MuscleGroupTags groups={guide.targetMuscles} />
          </View>
        ) : null}

        <DetailTabBar
          tabs={TABS.map((tab) => ({ key: tab, label: TAB_LABELS[tab] }))}
          activeTab={activeTab}
          onChange={(key) => setActiveTab(key as TabType)}
        />

        {activeTab === "tutorial" ? (
          <View style={styles.tabContent}>
            <TutorialSteps steps={tutorials} />
          </View>
        ) : null}

        {activeTab === "safety" ? (
          <View style={styles.tabContent}>
            <SafetyTips tips={guide.safetyTips} />
          </View>
        ) : null}

        {activeTab === "videos" ? (
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
        ) : null}

        {activeTab === "calculator" ? (
          <View style={styles.tabContent}>
            <View style={styles.calcCard}>
              <Text style={styles.calcLabel}>{t("equipment.body_weight")}</Text>
              <View style={styles.calcInputRow}>
                <TextInput
                  style={styles.calcInput}
                  placeholder={t("equipment.body_weight_placeholder")}
                  placeholderTextColor={coachColors.textSecondary}
                  keyboardType="numeric"
                  value={bodyWeight}
                  onChangeText={setBodyWeight}
                  accessibilityLabel={t("equipment.body_weight")}
                />
                <View style={styles.unitToggle}>
                  <Text style={[styles.unitText, useLbs && styles.unitActive]}>lbs</Text>
                  <Switch
                    value={!useLbs}
                    onValueChange={(value) => setUseLbs(!value)}
                    trackColor={{ false: coachColors.coral, true: coachColors.coral }}
                    thumbColor={coachColors.card}
                    accessibilityLabel={t("equipment.body_weight")}
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
                    accessibilityRole="button"
                    accessibilityLabel={t(`equipment.${item.toLowerCase()}`)}
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
              <Text style={styles.calcNote}>{t("equipment.calc_note")}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-screen (standalone guide) styling — matches the original
  // app/equipment/workout-result.tsx content block exactly.
  sheetContent: { padding: spacing.xl },
  aiBadge: {
    backgroundColor: "#eef6e0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: "flex-start", marginBottom: 12,
  },
  aiBadgeText: { color: coachColors.limeText, fontSize: 11, fontFamily: coachFonts.bodySemiBold },
  name: { color: coachColors.text, fontSize: 32, fontFamily: coachFonts.headingExtraBold, marginBottom: 16, lineHeight: 36, letterSpacing: -0.5 },

  // Embedded (Workout Log card) styling.
  embeddedWrap: {
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    overflow: "hidden",
  },
  embeddedContent: { padding: spacing.lg },
  embeddedName: { color: coachColors.text, fontSize: 24, fontFamily: coachFonts.headingExtraBold, marginBottom: 12, letterSpacing: -0.3 },

  section: { marginBottom: 20 },
  sectionTitle: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyExtraBold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  tabContent: { gap: 12 },
  calcCard: {
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  calcLabel: { color: coachColors.textSecondary, fontSize: 11, fontFamily: coachFonts.bodyExtraBold, textTransform: "uppercase", marginBottom: 10 },
  calcInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  calcInput: {
    flex: 1,
    backgroundColor: coachColors.bg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: coachColors.text,
    fontSize: 18,
    fontFamily: coachFonts.bodyBold,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  unitToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  unitText: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.bodySemiBold },
  unitActive: { color: coachColors.coral, fontFamily: coachFonts.bodyBold },
  levelRow: { flexDirection: "row", gap: 8 },
  levelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: coachColors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  levelBtnActive: { backgroundColor: coachColors.coralPressed, borderColor: coachColors.coralPressed },
  levelBtnText: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodySemiBold },
  levelBtnTextActive: { color: coachColors.card, fontFamily: coachFonts.bodyBold },
  resultsCard: {
    backgroundColor: coachColors.coral + "0d",
    borderRadius: radii.card,
    padding: 20,
    borderWidth: 1,
    borderColor: coachColors.coral + "30",
  },
  resultsTitle: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyExtraBold, textTransform: "uppercase", marginBottom: 8 },
  resultsWeight: { color: coachColors.coral, fontSize: 38, fontFamily: coachFonts.headingExtraBold, marginBottom: 16 },
  resultsDivider: { height: 1, backgroundColor: coachColors.coral + "30", marginBottom: 16 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  resultKey: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body },
  resultVal: { color: coachColors.text, fontSize: 13, fontFamily: coachFonts.bodyBold },
  calcNote: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.body, lineHeight: 18, marginTop: 10 },
});

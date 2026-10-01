import React from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts } from "@/constants/theme";
import {
  AvatarMuscleGroup,
  nextLevelThreshold,
  UndertrainedRecommendation,
} from "@/lib/muscleProgress";
import { CompletedExerciseRow } from "@/store/muscleProgressStore";

interface MuscleDetailModalProps {
  visible: boolean;
  onClose: () => void;
  muscleGroup: AvatarMuscleGroup | null;
  score: number;
  level: number;
  totalCompletions: number;
  recentCompletions: CompletedExerciseRow[];
  loading: boolean;
  recommendation: UndertrainedRecommendation | null;
}

export default function MuscleDetailModal({
  visible,
  onClose,
  muscleGroup,
  score,
  level,
  totalCompletions,
  recentCompletions,
  loading,
  recommendation,
}: MuscleDetailModalProps) {
  const { t } = useTranslation();
  if (!muscleGroup) return null;

  const next = nextLevelThreshold(score);
  const progressPct = next ? Math.min(100, Math.round((score / next) * 100)) : 100;
  const showRecommendation = recommendation?.muscleGroup === muscleGroup;
  const muscleLabel = t(`avatar_progress.muscles.${muscleGroup}`);
  const recommendationText = showRecommendation
    ? t("avatar_progress.recommendation", {
        under: t(`avatar_progress.muscles.${recommendation!.muscleGroup}`),
        over: t(`avatar_progress.muscles.${recommendation!.comparisonGroup}`),
        suggestion: t(`avatar_progress.suggestions.${recommendation!.suggestionGroup}`),
      })
    : "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{muscleLabel}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={coachColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.levelRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{t("avatar_progress.level_badge", { level })}</Text>
            </View>
            <Text style={styles.scoreText}>{t("avatar_progress.points", { score })}</Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {next
              ? t("avatar_progress.points_to_level", { points: Math.max(next - score, 0), level: level + 1 })
              : t("avatar_progress.max_level")}
          </Text>

          <Text style={styles.sectionTitle}>
            {t(totalCompletions === 1 ? "avatar_progress.logged_count" : "avatar_progress.logged_count_plural", {
              count: totalCompletions,
            })}
          </Text>

          {loading ? (
            <ActivityIndicator color={coachColors.coral} style={{ marginVertical: 20 }} />
          ) : recentCompletions.length === 0 ? (
            <Text style={styles.empty}>{t("avatar_progress.empty_muscle")}</Text>
          ) : (
            <ScrollView style={styles.list}>
              {recentCompletions.map((item) => (
                <View key={item.id} style={styles.exerciseRow}>
                  <Ionicons name="checkmark-circle" size={16} color={coachColors.lime} />
                  <Text style={styles.exerciseName} numberOfLines={1}>{item.exercise_name}</Text>
                  <Text style={styles.exerciseDate}>
                    {new Date(item.completed_at).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          {showRecommendation && (
            <View style={styles.recommendation}>
              <Ionicons name="bulb-outline" size={18} color={coachColors.coral} />
              <Text style={styles.recommendationText}>{recommendationText}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: coachColors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "75%",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 24, fontFamily: coachFonts.heading, color: coachColors.text },
  levelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  levelBadge: {
    backgroundColor: coachColors.lime + "18", borderRadius: 8, borderWidth: 1, borderColor: coachColors.lime + "40",
    paddingHorizontal: 10, paddingVertical: 4,
  },
  levelBadgeText: { color: coachColors.lime, fontSize: 13, fontFamily: coachFonts.bodyBold },
  scoreText: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.bodySemiBold },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: coachColors.bg, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: coachColors.lime },
  progressLabel: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.body, marginTop: 6, marginBottom: 18 },
  sectionTitle: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyBold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  empty: { color: coachColors.textSecondary, fontFamily: coachFonts.body, paddingVertical: 12 },
  list: { maxHeight: 180 },
  exerciseRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: coachColors.border },
  exerciseName: { flex: 1, color: coachColors.text, fontSize: 14, fontFamily: coachFonts.body },
  exerciseDate: { color: coachColors.textSecondary, fontSize: 11, fontFamily: coachFonts.body },
  recommendation: {
    flexDirection: "row", gap: 10, marginTop: 18,
    backgroundColor: coachColors.coral + "0f", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: coachColors.coral + "30",
  },
  recommendationText: { flex: 1, color: coachColors.text, fontSize: 13, fontFamily: coachFonts.body, lineHeight: 19 },
});

import React from "react";
import { View, Text, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";
import { AvatarMuscleGroup } from "@/lib/muscleProgress";

export interface MuscleSummaryEntry {
  group: AvatarMuscleGroup;
  totalPoints: number;
  leveledUp: boolean;
}

interface WorkoutSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  exerciseCount: number;
  muscleSummary: MuscleSummaryEntry[];
}

export default function WorkoutSummaryModal({
  visible,
  onClose,
  exerciseCount,
  muscleSummary,
}: WorkoutSummaryModalProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name="trophy" size={28} color={colors.white} />
          </View>
          <Text style={styles.title}>{t("avatar_progress.workout_logged")}</Text>
          <Text style={styles.subtitle}>
            {t(exerciseCount === 1 ? "avatar_progress.summary_completed" : "avatar_progress.summary_completed_plural", {
              count: exerciseCount,
            })}
          </Text>

          <View style={styles.muscleList}>
            {muscleSummary.map((entry) => (
              <View key={entry.group} style={styles.muscleRow}>
                <Text style={styles.muscleLabel}>{t(`avatar_progress.muscles.${entry.group}`)}</Text>
                <View style={styles.muscleRight}>
                  {entry.leveledUp && (
                    <View style={styles.levelUpBadge}>
                      <Text style={styles.levelUpText}>{t("avatar_progress.level_up")}</Text>
                    </View>
                  )}
                  <Text style={styles.musclePoints}>+{entry.totalPoints}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={onClose} style={styles.doneButton} activeOpacity={0.88}>
            <Text style={styles.doneButtonText}>{t("common.done")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%", maxWidth: 360, backgroundColor: colors.bg, borderRadius: 24, padding: 24, alignItems: "center",
  },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.lime,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 22, fontFamily: fonts.heading, color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textSecondary, marginBottom: 18, textAlign: "center" },
  muscleList: { width: "100%", gap: 8, marginBottom: 20 },
  muscleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  muscleLabel: { color: colors.text, fontSize: 14, fontFamily: fonts.semiBold },
  muscleRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  levelUpBadge: { backgroundColor: colors.coral + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  levelUpText: { color: colors.coral, fontSize: 10, fontFamily: fonts.bold },
  musclePoints: { color: colors.lime, fontSize: 14, fontFamily: fonts.bold },
  doneButton: { backgroundColor: colors.coral, borderRadius: 14, paddingVertical: 12, width: "100%", alignItems: "center" },
  doneButtonText: { color: colors.white, fontSize: 15, fontFamily: fonts.bold },
});

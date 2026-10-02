// Coach Forward Equipment (AI workout guide) — Phase 6.
//
// The tabbed content (name/chips, Tutorial/Safety/Videos/Calculator) now
// lives in components/Equipment/ExerciseLearningCard.tsx, shared with the
// Workout Log screen (app/workout-log.tsx) — see that component's own
// header comment. This screen keeps its own chrome: the full-bleed muscle
// map hero with the back button, and the rounded sheet it sits in.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import MuscleMapView from "@/components/Equipment/MuscleMapView";
import ExerciseLearningCard from "@/components/Equipment/ExerciseLearningCard";
import { useWorkoutGuideStore } from "@/store/workoutGuideStore";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";

export default function WorkoutResultScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { currentGuide } = useWorkoutGuideStore();
  const insets = useSafeAreaInsets();

  if (!currentGuide) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorText}>{t("equipment.could_not_load_workout_guide")}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOutline}>
          <Text style={styles.backButtonOutlineText}>{t("equipment.go_back")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.hero}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.heroBackBtn, { top: insets.top + spacing.sm }]}
        >
          <Ionicons name="chevron-back" size={20} color={coachColors.card} />
        </TouchableOpacity>
        <MuscleMapView muscleGroups={currentGuide.targetMuscles} />
      </View>

      <ScrollView style={styles.sheet} showsVerticalScrollIndicator={false}>
        <ExerciseLearningCard guide={currentGuide} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: coachColors.coachNavy },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: coachColors.bg },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorText: { color: coachColors.text, fontSize: 18, fontFamily: coachFonts.bodyBold, marginBottom: 24, textAlign: "center" },
  backButtonOutline: { borderWidth: 1, borderColor: coachColors.border, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 10 },
  backButtonOutlineText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold },
  hero: { height: 220, alignItems: "center", justifyContent: "center" },
  heroBackBtn: {
    position: "absolute",
    left: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  sheet: { flex: 1, backgroundColor: coachColors.bg, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet },
});

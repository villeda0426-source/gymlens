// Coach Forward active workout — Phase 6.
//
// Local/ephemeral state only — no persistence, no new API (per-plan
// confirmation in the Coach Forward plan). Reached from Home's "Start
// workout" (today's real plan session) or Equipment's "Add to today's
// workout" (a single ad-hoc exercise — no real exercise_id exists for that
// path, so markExerciseCompleted is skipped there; it's not a lie, it's a
// scanned machine, not a plan entry).
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { coachColors, coachDark, coachFonts, radii, spacing } from "@/constants/theme";
import Stepper from "@/components/UI/Stepper";
import SegmentedProgressBar from "@/components/UI/SegmentedProgressBar";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";

interface SessionExercise {
  id: string;
  name: string;
  sets: number;
  repsLabel: string;
  defaultReps: number;
  restSeconds: number;
  coachNotes?: string;
  isPlanExercise: boolean;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function WorkoutSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { exercise: adHocExercise } = useLocalSearchParams<{ exercise?: string; muscles?: string }>();
  const { plan, units, markExerciseCompleted } = useCoachTrainerStore();

  const todaySession = plan?.sessions?.[0] ?? null;

  const exercises = useMemo<SessionExercise[]>(() => {
    if (adHocExercise) {
      return [
        {
          id: "adhoc",
          name: adHocExercise,
          sets: 3,
          repsLabel: "8-12",
          defaultReps: 10,
          restSeconds: 60,
          isPlanExercise: false,
        },
      ];
    }
    if (!todaySession) return [];
    return todaySession.exercises.map((exercise) => ({
      id: exercise.exercise_id,
      name: exercise.name,
      sets: exercise.sets,
      repsLabel: `${exercise.rep_range.min}-${exercise.rep_range.max}`,
      defaultReps: exercise.rep_range.min,
      restSeconds: exercise.rest_seconds,
      coachNotes: exercise.coach_notes || undefined,
      isPlanExercise: true,
    }));
  }, [adHocExercise, todaySession]);

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(exercises[0]?.defaultReps ?? 10);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);

  const currentExercise = exercises[exerciseIndex] ?? null;
  const nextExercise = exercises[exerciseIndex + 1] ?? null;
  const weightStep = units === "kg" ? 2.5 : 5;

  useEffect(() => {
    if (paused || finished) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [paused, finished]);

  useEffect(() => {
    setReps(currentExercise?.defaultReps ?? 10);
  }, [exerciseIndex]);

  const handleLogSet = async () => {
    if (!currentExercise) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (setIndex + 1 < currentExercise.sets) {
      setSetIndex(setIndex + 1);
      return;
    }

    if (currentExercise.isPlanExercise) {
      markExerciseCompleted(currentExercise.id);
    }

    if (exerciseIndex + 1 < exercises.length) {
      setExerciseIndex(exerciseIndex + 1);
      setSetIndex(0);
    } else {
      setFinished(true);
    }
  };

  const askCoachAboutExercise = () => {
    if (!currentExercise) return;
    router.push({
      pathname: "/(tabs)/trainer",
      params: { ask: t("workout_session.ask_coach_prefill", { exercise: currentExercise.name }) },
    });
  };

  if (exercises.length === 0) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { paddingTop: insets.top + spacing.xl }]}>
        <StatusBar style="light" />
        <Text style={styles.emptyTitle}>{t("workout_session.empty_title")}</Text>
        <Text style={styles.emptyBody}>{t("workout_session.empty_body")}</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => router.push("/trainer")}>
          <Text style={styles.emptyButtonText}>{t("workout_session.talk_to_coach")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (finished) {
    return (
      <View style={[styles.screen, styles.emptyScreen, { paddingTop: insets.top + spacing.xl }]}>
        <StatusBar style="light" />
        <Ionicons name="checkmark-circle" size={48} color={coachDark.limeOnDark} />
        <Text style={styles.emptyTitle}>{t("workout_session.complete_title")}</Text>
        <Text style={styles.emptyBody}>
          {t(exercises[0]?.isPlanExercise ? "workout_session.complete_body_plan" : "workout_session.complete_body_adhoc")}
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => router.push("/(tabs)")}>
          <Text style={styles.emptyButtonText}>{t("workout_session.done_button")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg }]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t("workout_session.end_workout")}
        >
          <Ionicons name="close" size={18} color={coachDark.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>
            {(todaySession?.focus ?? t("workout_session.quick_session")).toUpperCase()}
            {exercises.length > 1 ? ` · ${exerciseIndex + 1}/${exercises.length}` : ""}
          </Text>
          <Text style={styles.headerClock}>{formatClock(seconds)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => setPaused((value) => !value)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={t(paused ? "workout_session.resume" : "workout_session.pause")}
        >
          <Ionicons name={paused ? "play" : "pause"} size={16} color={coachDark.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.exerciseName}>{currentExercise!.name}</Text>
        <SegmentedProgressBar count={currentExercise!.sets} currentIndex={setIndex} />
        <Text style={styles.setLabel}>
          {t("workout_session.set_label", { current: setIndex + 1, total: currentExercise!.sets })}
        </Text>

        <View style={styles.stepperRow}>
          <Stepper
            label={units === "kg" ? t("workout_session.kg") : t("workout_session.lbs")}
            value={weight}
            onDecrement={() => setWeight((value) => Math.max(0, value - weightStep))}
            onIncrement={() => setWeight((value) => value + weightStep)}
            decrementLabel={t("workout_session.decrease_weight")}
            incrementLabel={t("workout_session.increase_weight")}
          />
          <Stepper
            label={t("workout_session.reps")}
            value={reps}
            onDecrement={() => setReps((value) => Math.max(0, value - 1))}
            onIncrement={() => setReps((value) => value + 1)}
            decrementLabel={t("workout_session.decrease_reps")}
            incrementLabel={t("workout_session.increase_reps")}
          />
        </View>

        {currentExercise!.coachNotes ? (
          <View style={styles.coachTipCard}>
            <Ionicons name="star" size={18} color={coachColors.coachGold} />
            <Text style={styles.coachTipText}>{currentExercise!.coachNotes}</Text>
            <TouchableOpacity
              onPress={askCoachAboutExercise}
              style={styles.coachTipMic}
              accessibilityRole="button"
              accessibilityLabel={t("workout_session.ask_coach_about_exercise")}
            >
              <Ionicons name="mic" size={18} color={coachColors.coachNavy} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logSetButton} onPress={handleLogSet} accessibilityRole="button">
          <Ionicons name="checkmark" size={22} color={coachDark.bg} />
          <Text style={styles.logSetText}>{t("workout_session.log_set")}</Text>
        </TouchableOpacity>
        {nextExercise ? (
          <View style={styles.nextRow}>
            <Text style={styles.nextText}>{t("workout_session.next_label", { name: nextExercise.name })}</Text>
            <Text style={styles.nextText}>
              {t("workout_session.rest_label", { time: formatClock(currentExercise!.restSeconds) })}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: coachDark.bg, paddingHorizontal: spacing.xl },
  emptyScreen: { alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xxl },
  emptyTitle: { color: coachDark.text, fontFamily: coachFonts.headingSemiBold, fontSize: 22, textAlign: "center" },
  emptyBody: { color: coachDark.textSecondary, fontFamily: coachFonts.body, fontSize: 15, textAlign: "center", lineHeight: 21 },
  emptyButton: { marginTop: spacing.sm, height: 52, paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: coachDark.coralOnDark, alignItems: "center", justifyContent: "center" },
  emptyButtonText: { color: coachDark.bg, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: spacing.md },
  iconButton: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: coachDark.surface, alignItems: "center", justifyContent: "center" },
  headerCenter: { alignItems: "center" },
  headerEyebrow: { color: coachDark.textSecondary, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.4 },
  headerClock: { color: coachDark.text, fontFamily: coachFonts.heading, fontSize: 22, fontVariant: ["tabular-nums"], marginTop: 2 },

  body: { gap: spacing.md, flexGrow: 1 },
  exerciseName: { color: coachDark.text, fontFamily: coachFonts.headingExtraBold, fontSize: 36, letterSpacing: -0.5 },
  setLabel: { color: coachDark.coralOnDark, fontFamily: coachFonts.bodyExtraBold, fontSize: 13, letterSpacing: 1.4 },
  stepperRow: { flexDirection: "row", gap: spacing.md },
  coachTipCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: coachColors.coachNavy,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
  },
  coachTipText: { flex: 1, color: coachDark.text, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 20 },
  coachTipMic: { width: 48, height: 48, borderRadius: radii.pill, backgroundColor: coachColors.coachGold, alignItems: "center", justifyContent: "center" },

  footer: { gap: spacing.sm, paddingTop: spacing.sm },
  logSetButton: {
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: coachDark.limeOnDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  logSetText: { color: coachDark.bg, fontFamily: coachFonts.headingExtraBold, fontSize: 22 },
  nextRow: { flexDirection: "row", justifyContent: "space-between" },
  nextText: { color: coachDark.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 14, fontVariant: ["tabular-nums"] },
});

// Coach Forward active workout — Phase 6.
//
// Local/ephemeral state only — no persistence, no new API (per-plan
// confirmation in the Coach Forward plan). Reached from Home's "Start
// workout" (today's real plan session) or Equipment's "Add to today's
// workout" (a single ad-hoc exercise — no real exercise_id exists for that
// path, so markExerciseCompleted is skipped there; it's not a lie, it's a
// scanned machine, not a plan entry).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { coachColors, coachDark, coachFonts, radii, spacing } from "@/constants/theme";
import Stepper from "@/components/UI/Stepper";
import SegmentedProgressBar from "@/components/UI/SegmentedProgressBar";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import CoachIcon from "@/components/Coach/CoachIcon";
import { buildPlanSequence, nextWorkoutItem } from "@/lib/planSequence";
import { exerciseLoad, type ExerciseLoad } from "@/lib/exerciseLoad";
import { findTodayInstance, upsertSet, type WorkoutLogContext } from "@/lib/workoutSetLogs";
import { useAuthStore } from "@/store/authStore";
import { isActiveFor, useActiveWorkoutStore } from "@/store/activeWorkoutStore";

interface SessionExercise {
  id: string;
  name: string;
  sets: number;
  repsLabel: string;
  defaultReps: number;
  restSeconds: number;
  coachNotes?: string;
  isPlanExercise: boolean;
  load: ExerciseLoad;
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
  const { exercise: adHocExercise, sessionIndex: sessionIndexParam } = useLocalSearchParams<{
    exercise?: string;
    muscles?: string;
    sessionIndex?: string;
  }>();
  const {
    plan,
    units,
    markExerciseCompleted,
    completedExerciseIds,
    sessionCompletedAt,
    activeThreadId,
  } = useCoachTrainerStore();
  const { user } = useAuthStore();
  const { active, hasLoaded: activeLoaded, load: loadActive, save: saveActive, clear: clearActive } = useActiveWorkoutStore();

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  // A specific workout when the Plan tab says which; otherwise the workout
  // already in progress, then the next unfinished one in order. Fixed once
  // the session starts, so finishing it doesn't swap the screen mid-way.
  const [sessionIndex, setSessionIndex] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    if (resolved || !activeLoaded) return;
    if (!plan || adHocExercise) {
      setResolved(true);
      return;
    }
    const requested = sessionIndexParam !== undefined ? Number.parseInt(sessionIndexParam, 10) : NaN;
    const activeSession = active ? plan.sessions[active.sessionIndex] : undefined;
    // Only a workout that's still unfinished can be resumed.
    const resumable =
      active &&
      activeSession?.day_label === active.sessionLabel &&
      active.threadId === activeThreadId &&
      !activeSession.exercises.every((exercise) => completedExerciseIds.includes(exercise.exercise_id))
        ? active
        : null;
    if (active && !resumable) clearActive();
    const next = nextWorkoutItem(buildPlanSequence({ plan, completedExerciseIds, sessionCompletedAt }));
    const target = Number.isInteger(requested) && plan.sessions[requested] ? requested : resumable?.sessionIndex ?? next?.sessionIndex ?? null;

    // Another workout is already in progress: resuming and starting fresh
    // are different things, so ask instead of silently replacing it.
    if (resumable && target !== null && target !== resumable.sessionIndex) {
      Alert.alert(
        t("workout_session.in_progress_title"),
        t("workout_session.in_progress_message", { number: resumable.sessionIndex + 1 }),
        [
          {
            text: t("workout_session.resume_number", { number: resumable.sessionIndex + 1 }),
            onPress: () => {
              setSessionIndex(resumable.sessionIndex);
              setResolved(true);
            },
          },
          {
            text: t("workout_session.start_number", { number: target + 1 }),
            style: "destructive",
            onPress: () => {
              clearActive();
              setSessionIndex(target);
              setResolved(true);
            },
          },
        ],
        { cancelable: false }
      );
      return;
    }
    setSessionIndex(target);
    setResolved(true);
  }, [resolved, activeLoaded]);

  const todaySession = sessionIndex !== null ? plan?.sessions?.[sessionIndex] ?? null : null;

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
          load: "external",
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
      load: exerciseLoad({ id: exercise.exercise_id, name: exercise.name, category: exercise.category }),
    }));
  }, [adHocExercise, todaySession]);

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setIndex, setSetIndex] = useState(0);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(10);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [restored, setRestored] = useState(false);
  const instanceIds = useRef<Record<string, string>>({});

  const currentExercise = exercises[exerciseIndex] ?? null;
  const nextExercise = exercises[exerciseIndex + 1] ?? null;
  const weightStep = units === "kg" ? 2.5 : 5;
  const isPlanWorkout = !adHocExercise && sessionIndex !== null && !!todaySession;

  const logContext = (exercise: SessionExercise): WorkoutLogContext | null =>
    user?.id && exercise.isPlanExercise && sessionIndex !== null && todaySession
      ? {
          userId: user.id,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          planThreadId: activeThreadId ?? null,
          sessionIndex,
          sessionLabel: todaySession.day_label,
          planWeek: plan ? Math.floor(sessionIndex / Math.max(1, plan.days_per_week)) + 1 : null,
        }
      : null;

  // Where to pick up: the saved position when resuming, otherwise the first
  // exercise not yet finished (some may already be checked off on Plan).
  useEffect(() => {
    if (!resolved || restored || exercises.length === 0) return;
    const saved = isPlanWorkout && sessionIndex !== null && isActiveFor(active, activeThreadId ?? null, sessionIndex, todaySession?.day_label) ? active : null;
    if (saved) {
      setExerciseIndex(Math.min(saved.exerciseIndex, exercises.length - 1));
      setSetIndex(saved.setIndex);
      setSeconds(saved.elapsedSeconds);
      setWeight(saved.weight);
      setReps(saved.reps);
    } else {
      const firstOpen = exercises.findIndex((exercise) => !completedExerciseIds.includes(exercise.id));
      const startAt = firstOpen >= 0 ? firstOpen : 0;
      setExerciseIndex(startAt);
      setReps(exercises[startAt]?.defaultReps ?? 10);
    }
    setRestored(true);
  }, [resolved, restored, exercises.length]);

  // Keep the saved position current so leaving never loses it.
  useEffect(() => {
    if (!restored || !isPlanWorkout || finished || sessionIndex === null || !todaySession) return;
    saveActive({
      threadId: activeThreadId ?? null,
      sessionIndex,
      sessionLabel: todaySession.day_label,
      startedAt: active?.startedAt ?? new Date().toISOString(),
      elapsedSeconds: seconds,
      exerciseIndex,
      setIndex,
      weight,
      reps,
      updatedAt: new Date().toISOString(),
    });
    // Clock ticks are saved every 10s rather than every second.
  }, [restored, exerciseIndex, setIndex, weight, reps, finished, Math.floor(seconds / 10)]);

  useEffect(() => {
    if (paused || finished || !restored) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [paused, finished, restored]);

  const advanceExercise = () => {
    if (exerciseIndex + 1 < exercises.length) {
      setExerciseIndex(exerciseIndex + 1);
      setSetIndex(0);
      setReps(exercises[exerciseIndex + 1]?.defaultReps ?? 10);
    } else {
      setFinished(true);
      if (isPlanWorkout) clearActive();
    }
  };

  // Coming back from this exercise's Workout Log: sets may have been added,
  // edited, or completed there, so pick up from what's actually saved.
  const syncFromLog = async () => {
    const exercise = currentExercise;
    const ctx = exercise ? logContext(exercise) : null;
    if (!exercise || !ctx) return;
    try {
      const instance = await findTodayInstance(ctx);
      if (!instance) return;
      instanceIds.current[exercise.id] = instance.instanceId;
      const done = instance.sets.filter((row) => row.completed).length;
      if (done >= exercise.sets) {
        markExerciseCompleted(exercise.id);
        advanceExercise();
      } else {
        setSetIndex(done);
      }
    } catch {
      // Keep the local position if the log can't be read right now.
    }
  };

  const returningFromLog = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!returningFromLog.current) return;
      returningFromLog.current = false;
      syncFromLog();
    }, [currentExercise?.id, sessionIndex])
  );

  const saveLoggedSet = async (exercise: SessionExercise, setNumber: number) => {
    const ctx = logContext(exercise);
    if (!ctx) return;
    try {
      if (!instanceIds.current[exercise.id]) {
        const existing = await findTodayInstance(ctx);
        instanceIds.current[exercise.id] = existing?.instanceId ?? Crypto.randomUUID();
      }
      await upsertSet(ctx, instanceIds.current[exercise.id], {
        setNumber,
        reps,
        // 0 on the stepper means no added load.
        weightValue: weight > 0 ? weight : null,
        weightUnit: units,
        completed: true,
      });
    } catch {
      // The set still counts in the session; it can be fixed in the log.
    }
  };

  const handleLogSet = async () => {
    if (!currentExercise) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    void saveLoggedSet(currentExercise, setIndex + 1);

    if (setIndex + 1 < currentExercise.sets) {
      setSetIndex(setIndex + 1);
      return;
    }

    if (currentExercise.isPlanExercise) {
      markExerciseCompleted(currentExercise.id);
    }
    advanceExercise();
  };

  const openExerciseLog = () => {
    if (!currentExercise || sessionIndex === null || !todaySession || !plan) return;
    const planExercise = todaySession.exercises.find((exercise) => exercise.exercise_id === currentExercise.id);
    if (!planExercise) return;
    returningFromLog.current = true;
    router.push({
      pathname: "/workout-log",
      params: {
        exerciseId: planExercise.exercise_id,
        exerciseName: planExercise.name,
        plannedSetCount: String(planExercise.sets),
        repMin: String(planExercise.rep_range.min),
        repMax: String(planExercise.rep_range.max),
        load: currentExercise.load,
        sessionLabel: todaySession.day_label,
        sessionIndex: String(sessionIndex),
        planWeek: String(Math.floor(sessionIndex / Math.max(1, plan.days_per_week)) + 1),
        threadId: activeThreadId ?? undefined,
      },
    });
  };

  const askCoachAboutExercise = () => {
    if (!currentExercise) return;
    router.push({
      pathname: "/(tabs)/trainer",
      params: { ask: t("workout_session.ask_coach_prefill", { exercise: currentExercise.name }) },
    });
  };

  if (!resolved || (exercises.length > 0 && !restored)) {
    return <View style={[styles.screen, { paddingTop: insets.top }]}><StatusBar style="light" /></View>;
  }

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
          accessibilityLabel={t(isPlanWorkout ? "workout_session.leave_saved" : "workout_session.end_workout")}
        >
          <Ionicons name="close" size={18} color={coachDark.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow} numberOfLines={1}>
            {(todaySession && sessionIndex !== null
              ? `${t("plan.workout_number", { number: sessionIndex + 1 })} · ${todaySession.focus}`
              : t("workout_session.quick_session")
            ).toUpperCase()}
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
        <View style={styles.setRow}>
          <Text style={styles.setLabel}>
            {t("workout_session.set_label", { current: setIndex + 1, total: currentExercise!.sets })}
          </Text>
          {isPlanWorkout && user ? (
            <TouchableOpacity
              onPress={openExerciseLog}
              style={styles.logLink}
              accessibilityRole="button"
              accessibilityHint={t("workout_session.edit_sets_hint")}
            >
              <Ionicons name="list" size={15} color={coachDark.text} />
              <Text style={styles.logLinkText}>{t("workout_session.edit_sets")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.stepperRow}>
          <Stepper
            label={t(`workout_session.weight_label.${currentExercise!.load}`, { unit: units === "kg" ? t("workout_session.kg") : t("workout_session.lbs") })}
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
            <CoachIcon size={20} badgeSize={30} />
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
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm },
  headerEyebrow: { color: coachDark.textSecondary, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.4 },
  headerClock: { color: coachDark.text, fontFamily: coachFonts.heading, fontSize: 22, fontVariant: ["tabular-nums"], marginTop: 2 },

  body: { gap: spacing.md, flexGrow: 1 },
  exerciseName: { color: coachDark.text, fontFamily: coachFonts.headingExtraBold, fontSize: 36, letterSpacing: -0.5 },
  setRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  logLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: coachDark.surface,
  },
  logLinkText: { color: coachDark.text, fontFamily: coachFonts.bodyBold, fontSize: 13 },
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

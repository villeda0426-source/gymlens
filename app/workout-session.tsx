// Coach Forward active workout — the guided view of a workout.
//
// Reached from Home, Plan (including "Train early" on a rest day) and a
// workout's details for a plan session, or from Equipment's "Add to today's
// workout" for an ad-hoc exercise (logged under a custom: id — never a
// made-up plan exercise id — and not marked against the plan).
//
// Persistence: every logged set goes through one save path
// (lib/workoutSetLogs.ts upsertSet) into the same rows the Workout Log
// edits, linked to one workout occurrence (lib/workoutJournal.ts). Saving
// is tracked, not assumed: unsaved sets are shown with a retry and kept on
// the device (store/activeWorkoutStore.ts) until the server confirms them.
// Position and timer resume from the same store.
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
import {
  createAdHocSession,
  findOrCreatePlanSession,
  recordQuickCompletion,
  updateSessionTiming,
} from "@/lib/workoutJournal";
import {
  adHocExerciseId,
  enqueueSet,
  flushQueue,
  nextOpenSetNumber,
  unsavedSets,
  type QueuedSet,
} from "@/lib/workoutJournalRules";
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
  const { exercise: adHocExercise, sessionIndex: sessionIndexParam, equipmentId } = useLocalSearchParams<{
    exercise?: string;
    muscles?: string;
    sessionIndex?: string;
    equipmentId?: string;
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
    if (active && !resumable) {
      // A finished workout can still have sets the server never confirmed:
      // send them before forgetting the device copy.
      const leftover = active.unsavedSets ?? [];
      if (leftover.length > 0 && user?.id) {
        const userId = user.id;
        void flushQueue(leftover, (item) =>
          upsertSet(
            {
              userId,
              exerciseId: item.exerciseId,
              exerciseName: item.exerciseName,
              planThreadId: active.threadId,
              sessionIndex: active.sessionIndex,
              sessionLabel: active.sessionLabel,
              planWeek: plan.days_per_week ? Math.floor(active.sessionIndex / Math.max(1, plan.days_per_week)) + 1 : null,
              workoutSessionId: active.workoutSessionId ?? null,
              entrySource: "guided",
            },
            item.instanceId,
            { setNumber: item.setNumber, reps: item.reps, weightValue: item.weightValue, weightUnit: item.weightUnit, completed: true }
          ).then(() => undefined)
        ).then((result) => {
          // Only forget them once they're all confirmed.
          if (unsavedSets(result).length === 0) clearActive();
        });
      } else {
        clearActive();
      }
    }
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
          id: adHocExerciseId(adHocExercise),
          name: adHocExercise,
          sets: 3,
          repsLabel: "8-12",
          defaultReps: 10,
          restSeconds: 60,
          isPlanExercise: false,
          load: exerciseLoad({ name: adHocExercise }),
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
  // Logged sets and whether the server has them (pending/saved/failed).
  const [queue, setQueue] = useState<QueuedSet[]>([]);
  const queueRef = useRef<QueuedSet[]>([]);
  const inFlight = useRef<Set<string>>(new Set());
  const [workoutSessionId, setWorkoutSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const currentExercise = exercises[exerciseIndex] ?? null;
  const nextExercise = exercises[exerciseIndex + 1] ?? null;
  const weightStep = units === "kg" ? 2.5 : 5;
  const isPlanWorkout = !adHocExercise && sessionIndex !== null && !!todaySession;

  const logContext = (exercise: SessionExercise): WorkoutLogContext | null => {
    if (!user?.id) return null;
    if (exercise.isPlanExercise && sessionIndex !== null && todaySession) {
      return {
        userId: user.id,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        planThreadId: activeThreadId ?? null,
        sessionIndex,
        sessionLabel: todaySession.day_label,
        planWeek: plan ? Math.floor(sessionIndex / Math.max(1, plan.days_per_week)) + 1 : null,
        workoutSessionId: sessionIdRef.current,
        entrySource: "guided",
      };
    }
    // Ad hoc: real persistence, but no plan context.
    return {
      userId: user.id,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      planThreadId: null,
      sessionIndex: null,
      sessionLabel: null,
      planWeek: null,
      workoutSessionId: sessionIdRef.current,
      entrySource: "guided",
      equipmentId: equipmentId ?? null,
    };
  };

  // The workout occurrence shared with the Workout Log and extras. Created
  // once; never blocks logging (sets still save without it).
  const ensureWorkoutSession = async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!user?.id) return null;
    try {
      const id =
        isPlanWorkout && sessionIndex !== null && todaySession
          ? await findOrCreatePlanSession({
              userId: user.id,
              threadId: activeThreadId ?? null,
              sessionIndex,
              sessionLabel: todaySession.day_label,
              planWeek: plan ? Math.floor(sessionIndex / Math.max(1, plan.days_per_week)) + 1 : null,
            })
          : await createAdHocSession(user.id);
      sessionIdRef.current = id;
      setWorkoutSessionId(id);
      return id;
    } catch {
      return null;
    }
  };

  const updateQueue = (next: QueuedSet[]) => {
    queueRef.current = next;
    setQueue(next);
  };

  const exerciseFor = (exerciseId: string) => exercises.find((exercise) => exercise.id === exerciseId) ?? null;

  // Sends every set the server hasn't confirmed. Each set is upserted by
  // (instance, set number), so a retry or repeated tap updates one row.
  const flushSets = async () => {
    const before = queueRef.current;
    if (unsavedSets(before).length === 0) return;
    await ensureWorkoutSession();
    const result = await flushQueue(
      before,
      async (item) => {
        const exercise = exerciseFor(item.exerciseId);
        const ctx = exercise ? logContext(exercise) : null;
        if (!ctx) throw new Error("Not signed in");
        await upsertSet(ctx, item.instanceId, {
          setNumber: item.setNumber,
          reps: item.reps,
          weightValue: item.weightValue,
          weightUnit: item.weightUnit,
          completed: true,
        });
      },
      inFlight.current
    );
    // Merge into the current queue: a set re-logged with new values while
    // this flush ran stays pending with its newer values; everything else
    // takes the result. Confirmed sets leave the unsaved list.
    const merged = queueRef.current.map((item) => {
      const flushed = before.find((entry) => entry.key === item.key);
      const outcome = result.find((entry) => entry.key === item.key);
      const unchanged = flushed && flushed.reps === item.reps && flushed.weightValue === item.weightValue;
      return outcome && unchanged ? outcome : item;
    });
    updateQueue(unsavedSets(merged));
  };

  const unsaved = unsavedSets(queue);
  const failedCount = unsaved.filter((item) => item.status === "failed").length;
  const pendingCount = unsaved.length - failedCount;

  // Where to pick up: the saved position when resuming, otherwise the first
  // exercise not yet finished (some may already be checked off on Plan).
  const alignWithSaved = useRef(false);
  useEffect(() => {
    if (!resolved || restored || exercises.length === 0) return;
    const saved = isPlanWorkout && sessionIndex !== null && isActiveFor(active, activeThreadId ?? null, sessionIndex, todaySession?.day_label) ? active : null;
    if (saved) {
      if (saved.workoutSessionId) {
        sessionIdRef.current = saved.workoutSessionId;
        setWorkoutSessionId(saved.workoutSessionId);
      }
      if (saved.unsavedSets?.length) updateQueue(saved.unsavedSets.map((item) => ({ ...item, status: "failed" as const })));
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
      alignWithSaved.current = isPlanWorkout;
    }
    setRestored(true);
  }, [resolved, restored, exercises.length]);

  // Keep the saved position current so leaving never loses it.
  useEffect(() => {
    if (!restored || !isPlanWorkout || sessionIndex === null || !todaySession) return;
    // After finishing, only keep the device copy while sets are unsaved.
    if (finished && unsavedSets(queue).length === 0) return;
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
      workoutSessionId,
      unsavedSets: unsavedSets(queue),
    });
    // Clock ticks are saved every 10s rather than every second.
  }, [restored, exerciseIndex, setIndex, weight, reps, finished, Math.floor(seconds / 10), workoutSessionId, queue]);

  // Finished with sets still unsaved: the device copy stays until a retry
  // gets them all to the server.
  useEffect(() => {
    if (finished && isPlanWorkout && unsavedSets(queue).length === 0) clearActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, queue]);

  // Create (or find) the workout occurrence as soon as the session starts,
  // and retry anything a previous visit couldn't save.
  useEffect(() => {
    if (!restored || !user?.id || exercises.length === 0) return;
    ensureWorkoutSession().then(() => {
      if (unsavedSets(queueRef.current).length > 0) void flushSets();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, user?.id]);

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
      const id = sessionIdRef.current;
      if (id) updateSessionTiming(id, seconds, true).catch(() => undefined);
      // Keep the device copy while any set is still unsaved, so it can be
      // retried; clear it once everything is confirmed.
      if (isPlanWorkout && unsavedSets(queueRef.current).length === 0) clearActive();
    }
  };

  // Coming back from this exercise's Workout Log: sets may have been added,
  // edited, or completed there, so pick up from what's actually saved.
  // Resolves true when it moved on to the next exercise.
  const syncFromLog = async (): Promise<boolean> => {
    const exercise = currentExercise;
    const ctx = exercise ? logContext(exercise) : null;
    if (!exercise || !ctx) return false;
    // "Mark done without details" in the log completes the exercise even
    // with no (or only some) saved sets.
    const markedDone =
      exercise.isPlanExercise && useCoachTrainerStore.getState().completedExerciseIds.includes(exercise.id);
    try {
      const instance = await findTodayInstance(ctx);
      if (!instance) {
        if (markedDone) advanceExercise();
        return markedDone;
      }
      instanceIds.current[exercise.id] = instance.instanceId;
      const completedNumbers = instance.sets.filter((row) => row.completed).map((row) => row.setNumber);
      const next = nextOpenSetNumber(completedNumbers, exercise.sets);
      if (next === null || markedDone) {
        if (exercise.isPlanExercise) markExerciseCompleted(exercise.id);
        advanceExercise();
        return true;
      }
      setSetIndex(next - 1);
    } catch {
      // Keep the local position if the log can't be read right now.
    }
    return false;
  };

  // Starting without a device copy (signed out and back in, another phone,
  // cleared storage) while today's sets are already saved: continue after
  // them rather than at set 1, which would overwrite a completed set.
  useEffect(() => {
    if (!restored || !alignWithSaved.current || finished) return;
    void syncFromLog().then((advanced) => {
      if (!advanced) alignWithSaved.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, currentExercise?.id]);

  const returningFromLog = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!returningFromLog.current) return;
      returningFromLog.current = false;
      syncFromLog();
    }, [currentExercise?.id, sessionIndex])
  );

  const handleLogSet = async () => {
    if (!currentExercise) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    const exercise = currentExercise;
    const ctx = logContext(exercise);
    if (ctx) {
      if (!instanceIds.current[exercise.id]) {
        const existing = await findTodayInstance(ctx).catch(() => null);
        instanceIds.current[exercise.id] = existing?.instanceId ?? Crypto.randomUUID();
      }
      // Performed values (not the plan's targets). 0 on the stepper means no
      // added load.
      updateQueue(
        enqueueSet(queueRef.current, {
          instanceId: instanceIds.current[exercise.id],
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          setNumber: setIndex + 1,
          reps,
          weightValue: weight > 0 ? weight : null,
          weightUnit: units,
        })
      );
      void flushSets();
    }

    if (setIndex + 1 < exercise.sets) {
      setSetIndex(setIndex + 1);
      return;
    }

    if (exercise.isPlanExercise) {
      markExerciseCompleted(exercise.id);
    }
    advanceExercise();
  };

  // Done without details: records completion only — no sets, reps, weight
  // or records are invented. Details can still be added in the log later.
  const handleQuickComplete = async () => {
    if (!currentExercise) return;
    const exercise = currentExercise;
    if (exercise.isPlanExercise) markExerciseCompleted(exercise.id);
    const id = await ensureWorkoutSession();
    if (id && user?.id) {
      recordQuickCompletion({ userId: user.id, sessionId: id, exerciseId: exercise.id, exerciseName: exercise.name }).catch(() => undefined);
    }
    advanceExercise();
  };

  const leaveWorkout = () => {
    const id = sessionIdRef.current;
    if (id) updateSessionTiming(id, seconds, false).catch(() => undefined);
    router.back();
  };

  const openExerciseLog = async () => {
    if (!currentExercise || sessionIndex === null || !todaySession || !plan) return;
    const planExercise = todaySession.exercises.find((exercise) => exercise.exercise_id === currentExercise.id);
    if (!planExercise) return;
    // Let just-logged sets land first so the log shows them (and doesn't
    // offer to re-add them); never wait more than a few seconds.
    await Promise.race([flushSets(), new Promise((resolve) => setTimeout(resolve, 4000))]);
    const sessionId = await ensureWorkoutSession();
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
        workoutSessionId: sessionId ?? undefined,
        from: "session",
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

  // Saving state for logged sets: quiet while pending, explicit (with a
  // retry) when the server didn't take them.
  const saveStatus =
    failedCount > 0 ? (
      <View style={styles.saveStatus} accessibilityLiveRegion="polite">
        <Ionicons name="alert-circle" size={16} color={coachDark.coralOnDark} />
        <Text style={styles.saveStatusFailed}>{t("workout_session.sets_not_saved", { count: failedCount })}</Text>
        <TouchableOpacity onPress={() => void flushSets()} accessibilityRole="button" hitSlop={8} style={styles.saveRetry}>
          <Text style={styles.saveRetryText}>{t("workout_session.retry")}</Text>
        </TouchableOpacity>
      </View>
    ) : pendingCount > 0 ? (
      <View style={styles.saveStatus}>
        <Text style={styles.saveStatusText}>{t("workout_session.saving_sets")}</Text>
      </View>
    ) : null;

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
        {saveStatus}
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
          onPress={leaveWorkout}
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
              onPress={() => void openExerciseLog()}
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
        {saveStatus}
        <TouchableOpacity
          onPress={() => void handleQuickComplete()}
          style={styles.quickDone}
          accessibilityRole="button"
          accessibilityHint={t("workout_session.quick_done_hint")}
        >
          <Text style={styles.quickDoneText}>{t("workout_session.quick_done")}</Text>
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
  saveStatus: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 28 },
  saveStatusText: { color: coachDark.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  saveStatusFailed: { color: coachDark.coralOnDark, fontFamily: coachFonts.bodyBold, fontSize: 13 },
  saveRetry: { minHeight: 32, paddingHorizontal: 10, justifyContent: "center" },
  saveRetryText: { color: coachDark.text, fontFamily: coachFonts.bodyExtraBold, fontSize: 13, textDecorationLine: "underline" },
  quickDone: { alignSelf: "center", minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  quickDoneText: { color: coachDark.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13, textDecorationLine: "underline" },
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

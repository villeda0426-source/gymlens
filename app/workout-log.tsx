// Workout Log — docs/design/workout-log-implementation-handoff.md.
// The table view of one exercise in a workout. Two ways in, one record:
// - a Plan-tab exercise row (app/(tabs)/plan.tsx handleOpenExercise), and
// - "Edit sets" in the guided session (app/workout-session.tsx), which
//   passes its workout id and returns there on Back.
// Both read and write the same workout_set_logs rows, linked to the same
// workout occurrence (lib/workoutJournal.ts), so changes show in both.
// PR per row = the previous best for that set number
// (lib/workoutJournalRules.ts computeSetRecords).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import ExerciseLearningCard, { type ExerciseLearningGuide } from "@/components/Equipment/ExerciseLearningCard";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { apiFetch } from "@/lib/api";
import type { Units } from "@/lib/coachTrainer";
import {
  deleteSet,
  fetchExerciseRecords,
  findTodayInstance,
  fromKg,
  updateSetNumber,
  upsertSet,
  type WorkoutLogContext,
  type WorkoutSetRow,
} from "@/lib/workoutSetLogs";
import {
  createAdHocSession,
  findOrCreatePlanSession,
  findPlanSession,
  hasQuickCompletion,
  journalAvailable,
  recordQuickCompletion,
} from "@/lib/workoutJournal";
import WorkoutExtras from "@/components/Workout/WorkoutExtras";
import { exerciseLoad, parseExerciseLoad } from "@/lib/exerciseLoad";
import { useAuthStore } from "@/store/authStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { useWorkoutGuideStore } from "@/store/workoutGuideStore";

// iOS number pads have no return key; this bar rides on top of the keyboard
// so a set can be added (or the keyboard closed) mid-entry.
const SET_KEYBOARD_BAR = "workout-log-set-keyboard";

interface LocalSet {
  id: string | null; // null = draft, not yet written to the database
  setNumber: number;
  reps: string; // controlled-input strings; parsed to number/null on save
  weightValue: string;
  weightUnit: Units;
  completed: boolean;
  saving: boolean;
  error: boolean;
  // Filled from "Use previous sets": a suggestion until the person confirms it.
  copied?: boolean;
}

function toLocalSet(row: WorkoutSetRow): LocalSet {
  return {
    id: row.id,
    setNumber: row.setNumber,
    reps: row.reps !== null ? String(row.reps) : "",
    weightValue: row.weightValue !== null ? String(row.weightValue) : "",
    weightUnit: row.weightUnit,
    completed: row.completed,
    saving: false,
    error: false,
  };
}

// Weight as typed: digits with one decimal point (a comma counts, for
// keyboards that use one), so "22.5.5" can't silently save as nothing.
function cleanWeightInput(value: string): string {
  const [whole, ...rest] = value.replace(/,/g, ".").replace(/[^0-9.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

// Blank = no weight. Capped at a value no free weight or stack exceeds, so
// a typo can't become an impossible personal record.
const MAX_WEIGHT = 2000;
function parseWeight(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) return null;
  return Math.min(MAX_WEIGHT, Math.max(0, Math.round(parsed * 100) / 100));
}

function formatWeight(valueKg: number | null, unit: Units, t: (key: string, opts?: any) => string): string {
  if (valueKg === null) return t("workout_log.no_pr");
  const value = fromKg(valueKg, unit);
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

export default function WorkoutLogScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    exerciseId: string;
    exerciseName: string;
    plannedSetCount: string;
    repMin: string;
    repMax: string;
    sessionLabel?: string;
    sessionIndex?: string;
    threadId?: string;
    planWeek?: string;
    load?: string;
    category?: string;
    // Set by the guided session's "Edit sets".
    workoutSessionId?: string;
    from?: string;
    equipmentId?: string;
  }>();
  const { user } = useAuthStore();
  const { plan, markExerciseCompleted, unmarkExerciseCompleted, completedExerciseIds } = useCoachTrainerStore();
  const fromSession = params.from === "session";
  // Narrow phones: the back button keeps its spoken label but drops the
  // visible one, so the title and workout context still fit.
  const { width: windowWidth } = useWindowDimensions();
  const labelledBack = fromSession && windowWidth >= 360;
  const sessionIndexNumber = params.sessionIndex ? Number.parseInt(params.sessionIndex, 10) : null;
  const { currentGuide } = useWorkoutGuideStore();

  const exerciseId = params.exerciseId ?? "";
  const exerciseName = params.exerciseName ?? "";
  const plannedSetCount = Math.max(1, Number.parseInt(params.plannedSetCount ?? "1", 10) || 1);
  const repMin = Number.parseInt(params.repMin ?? "8", 10) || 8;
  const repMax = Number.parseInt(params.repMax ?? "12", 10) || repMin;
  const unit: Units = plan?.units === "kg" ? "kg" : "lbs";
  // What the weight column means for this exercise (lib/exerciseLoad.ts).
  const load =
    parseExerciseLoad(params.load) ?? exerciseLoad({ id: exerciseId, name: exerciseName, category: params.category });
  const lowerIsBetter = load === "assisted";

  const ctx: WorkoutLogContext = useMemo(
    () => ({
      userId: user?.id ?? "",
      exerciseId,
      exerciseName,
      planThreadId: params.threadId ?? null,
      sessionIndex: params.sessionIndex ? Number.parseInt(params.sessionIndex, 10) : null,
      sessionLabel: params.sessionLabel ?? null,
      planWeek: params.planWeek ? Number.parseInt(params.planWeek, 10) : null,
      equipmentId: params.equipmentId ?? null,
    }),
    [user?.id, exerciseId, exerciseName, params.threadId, params.sessionIndex, params.sessionLabel, params.planWeek, params.equipmentId]
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [prKg, setPrKg] = useState<number | null>(null);
  // Previous best per set number (kg), excluding this visit.
  const [setRecords, setSetRecords] = useState<Map<number, number>>(new Map());
  const [previousSets, setPreviousSets] = useState<Array<{ setNumber: number; reps: number | null; weightKg: number | null }>>([]);
  // The workout this exercise belongs to (shared with the guided session and
  // the extras). Null until it exists; created on the first write.
  const [workoutSessionId, setWorkoutSessionId] = useState<string | null>(params.workoutSessionId ?? null);
  const [journalOn, setJournalOn] = useState(false);
  const [quickDone, setQuickDone] = useState(false);
  const inFlight = useRef<Set<number>>(new Set());
  const resave = useRef<Map<number, LocalSet>>(new Map());
  const [guide, setGuide] = useState<ExerciseLearningGuide | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const wasFullyCompleted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setLoadError(false);
      try {
        const [instance, journal] = await Promise.all([findTodayInstance(ctx), journalAvailable()]);
        if (cancelled) return;
        setJournalOn(journal);

        let sessionId = params.workoutSessionId ?? null;
        if (!sessionId && journal && sessionIndexNumber !== null) {
          sessionId = await findPlanSession({
            userId: user.id,
            threadId: ctx.planThreadId,
            sessionIndex: sessionIndexNumber,
            sessionLabel: ctx.sessionLabel,
            planWeek: ctx.planWeek,
          }).catch(() => null);
        }
        if (cancelled) return;
        setWorkoutSessionId(sessionId);
        const currentInstanceId = instance?.instanceId ?? Crypto.randomUUID();
        const [records, quick] = await Promise.all([
          fetchExerciseRecords({ userId: user.id, exerciseId, currentInstanceId, currentSessionId: sessionId, lowerIsBetter }),
          sessionId && journal ? hasQuickCompletion(sessionId, exerciseId).catch(() => false) : Promise.resolve(false),
        ]);
        if (cancelled) return;
        setSetRecords(records.bySetNumber);
        setPreviousSets(records.previousSets);
        setPrKg(records.best);
        setQuickDone(quick);

        if (instance) {
          setInstanceId(instance.instanceId);
          setSets(instance.sets.map(toLocalSet));
          wasFullyCompleted.current = instance.sets
            .slice(0, plannedSetCount)
            .every((row) => row.completed) && instance.sets.length >= plannedSetCount;
        } else {
          setInstanceId(currentInstanceId);
          setSets(
            Array.from({ length: plannedSetCount }, (_, index) => ({
              id: null,
              setNumber: index + 1,
              reps: String(repMin),
              weightValue: "",
              weightUnit: unit,
              completed: false,
              saving: false,
              error: false,
            }))
          );
          wasFullyCompleted.current = false;
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, exerciseId, reloadKey]);

  // Fallback guide immediately (never blocks on the network), then refresh
  // through the existing guide-search path — same pattern as
  // app/(tabs)/plan.tsx's handleOpenExercise. Prefer the shared guide store:
  // handleOpenExercise seeds it with a richer, target-load/RPE-aware
  // fallback before navigating here. Only build a thinner one locally if
  // that's missing or stale (e.g. a direct deep link to this route).
  useEffect(() => {
    const isEs = t("workout_log.title") !== "Workout Log";
    if (currentGuide && currentGuide.exercise === exerciseName) {
      setGuide(currentGuide);
    } else {
      setGuide({
        exercise: exerciseName,
        targetMuscles: [],
        found: true,
        steps: [
          isEs ? `Prepárate para ${exerciseName} con control antes de la primera repetición.` : `Set up for ${exerciseName} with control before the first rep.`,
          isEs ? `${plannedSetCount} series de ${repMin}-${repMax} repeticiones. Mantén un movimiento fluido.` : `${plannedSetCount} sets of ${repMin}-${repMax} reps. Keep the movement smooth.`,
        ],
        safetyTips: [
          isEs ? "Comienza con menos peso del que crees necesitar hasta dominar el movimiento." : "Start lighter than you think you need until the movement feels clean.",
        ],
      });
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await apiFetch<{ exercise: string; targetMuscles: string[]; steps: string[]; safetyTips: string[]; found: boolean }>(
          "/api/workout-search",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: exerciseName, language: isEs ? "es" : "en" }),
          },
          30000
        );
        if (!cancelled && result?.found && result.steps?.length) setGuide(result);
      } catch {
        // Keep the local fallback guide visible when search is offline.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseName]);

  const syncPlanCompletion = (updatedSets: LocalSet[]) => {
    const prescribed = updatedSets.filter((s) => s.setNumber <= plannedSetCount);
    const allDone = prescribed.length >= plannedSetCount && prescribed.every((s) => s.completed);
    if (allDone && !wasFullyCompleted.current) {
      wasFullyCompleted.current = true;
      markExerciseCompleted(exerciseId);
    } else if (!allDone && wasFullyCompleted.current && !quickDone) {
      // A quick-completed exercise stays done while details are added.
      wasFullyCompleted.current = false;
      unmarkExerciseCompleted(exerciseId);
    }
  };

  // The workout occurrence, created on the first write when it doesn't
  // exist yet. Never blocks a set save: without it the set still saves,
  // just unlinked (as before the journal existed).
  const sessionPromise = useRef<Promise<string | null> | null>(null);
  const ensureSession = (): Promise<string | null> => {
    if (workoutSessionId) return Promise.resolve(workoutSessionId);
    if (!user?.id || !journalOn) return Promise.resolve(null);
    // Several sets can save at once ("Use previous sets"): share one
    // lookup/insert so they can't create duplicate workouts.
    if (!sessionPromise.current) {
      sessionPromise.current = createSession().finally(() => {
        sessionPromise.current = null;
      });
    }
    return sessionPromise.current;
  };

  const createSession = async (): Promise<string | null> => {
    if (!user?.id) return null;
    try {
      const id =
        sessionIndexNumber !== null
          ? await findOrCreatePlanSession({
              userId: user.id,
              threadId: ctx.planThreadId,
              sessionIndex: sessionIndexNumber,
              sessionLabel: ctx.sessionLabel,
              planWeek: ctx.planWeek,
            })
          : await createAdHocSession(user.id);
      setWorkoutSessionId(id);
      return id;
    } catch {
      return null;
    }
  };

  const refreshRecords = () => {
    if (!user?.id) return;
    fetchExerciseRecords({ userId: user.id, exerciseId, currentInstanceId: instanceId, currentSessionId: workoutSessionId, lowerIsBetter })
      .then((records) => {
        setSetRecords(records.bySetNumber);
        setPrKg(records.best);
      })
      .catch(() => undefined);
  };

  // Takes the row to save explicitly (by setNumber, not array index) rather
  // than reading it back out of `sets` — handleAddSet needs to persist a row
  // in the same tick it appends it, before a re-render could make a fresh
  // `sets` closure available, so looking it up here would silently read a
  // stale (pre-append) array and crash on undefined.
  //
  // One save per set at a time: a tap while it's saving is remembered and
  // sent after, so repeated taps update the same row (keyed by instance +
  // set number in the database) instead of racing. A failed save keeps the
  // typed values on screen with a retry.
  const persistSet = async (target: LocalSet) => {
    if (!instanceId || !user?.id) return;
    if (inFlight.current.has(target.setNumber)) {
      resave.current.set(target.setNumber, target);
      setSets((prev) => prev.map((s) => (s.setNumber === target.setNumber ? { ...target, saving: true, error: false } : s)));
      return;
    }
    inFlight.current.add(target.setNumber);
    setSets((prev) => prev.map((s) => (s.setNumber === target.setNumber ? { ...target, saving: true, error: false } : s)));

    const reps = target.reps.trim() === "" ? null : Math.max(0, Math.min(500, Math.round(Number(target.reps))));
    const weightValue = parseWeight(target.weightValue);

    try {
      const sessionId = await ensureSession();
      const saved = await upsertSet(
        { ...ctx, workoutSessionId: sessionId, entrySource: target.copied && !target.completed ? "copied_previous" : "table" },
        instanceId,
        {
          setNumber: target.setNumber,
          reps,
          weightValue,
          weightUnit: target.weightUnit,
          completed: target.completed,
        }
      );
      setSets((prev) => {
        const next = prev.map((s) =>
          s.setNumber === target.setNumber ? { ...toLocalSet(saved), copied: target.copied && !saved.completed, saving: false } : s
        );
        syncPlanCompletion(next);
        return next;
      });
      refreshRecords();
    } catch {
      setSets((prev) => prev.map((s) => (s.setNumber === target.setNumber ? { ...target, saving: false, error: true } : s)));
    } finally {
      inFlight.current.delete(target.setNumber);
      const queued = resave.current.get(target.setNumber);
      if (queued) {
        resave.current.delete(target.setNumber);
        void persistSet(queued);
      }
    }
  };

  // Copies the last workout's sets into today's rows as unconfirmed drafts.
  // They only count once each set is ticked Done.
  const handleUsePrevious = () => {
    const copied: LocalSet[] = previousSets.map((previous) => ({
      id: sets.find((s) => s.setNumber === previous.setNumber)?.id ?? null,
      setNumber: previous.setNumber,
      reps: previous.reps !== null ? String(previous.reps) : "",
      weightValue: previous.weightKg !== null ? String(Math.round(fromKg(previous.weightKg, unit) * 10) / 10) : "",
      weightUnit: unit,
      completed: false,
      saving: false,
      error: false,
      copied: true,
    }));
    const merged = [...sets.filter((s) => !copied.some((c) => c.setNumber === s.setNumber)), ...copied].sort(
      (a, b) => a.setNumber - b.setNumber
    );
    setSets(merged);
    copied.forEach((row) => void persistSet(row));
  };

  // Done without details: completion only — no sets, reps or weights are
  // invented, and nothing here can become a PR.
  const handleQuickComplete = async () => {
    if (!user?.id) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setQuickDone(true);
    wasFullyCompleted.current = true;
    markExerciseCompleted(exerciseId);
    const sessionId = await ensureSession();
    if (sessionId) {
      recordQuickCompletion({ userId: user.id, sessionId, exerciseId, exerciseName }).catch(() => undefined);
    }
  };

  const handleToggleDone = (set: LocalSet) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    persistSet({ ...set, completed: !set.completed });
  };

  const handleAddSet = () => {
    const draft: LocalSet = {
      id: null,
      setNumber: sets.length + 1,
      reps: String(repMin),
      weightValue: "",
      weightUnit: unit,
      completed: false,
      saving: false,
      error: false,
    };
    setSets((prev) => [...prev, draft]);
    // "Add set" is a deliberate action, unlike the initial prescribed rows —
    // it persists immediately rather than waiting for a further edit.
    persistSet(draft);
  };

  // Remove one set (completed or not), then close the gap in numbering so
  // the log stays Set 1, 2, 3... Confirmed first, so a stray tap can't do it.
  const handleDeleteSet = (target: LocalSet) => {
    // A save still in flight would land after the delete and renumbering
    // (keyed by set number) and bring a removed set back or overwrite its
    // neighbour — wait for saves to finish first.
    if (sets.some((s) => s.saving) || inFlight.current.size > 0) {
      Alert.alert(t("workout_log.delete_wait"));
      return;
    }
    Alert.alert(
      t("workout_log.delete_set_title", { set: target.setNumber }),
      t(target.completed ? "workout_log.delete_set_message_done" : "workout_log.delete_set_message"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("workout_log.delete_set_confirm"),
          style: "destructive",
          onPress: async () => {
            if (inFlight.current.size > 0) {
              Alert.alert(t("workout_log.delete_wait"));
              return;
            }
            const remaining = sets.filter((s) => s.setNumber !== target.setNumber);
            const renumbered = remaining.map((s, index) => ({ ...s, setNumber: index + 1 }));
            setSets(renumbered);
            try {
              if (target.id) await deleteSet(target.id);
              // Ascending, so each number is already free when it's reused.
              for (const row of renumbered) {
                const before = remaining.find((s) => s.id === row.id && s.id !== null);
                if (row.id && before && before.setNumber !== row.setNumber) await updateSetNumber(row.id, row.setNumber);
              }
              syncPlanCompletion(renumbered);
              refreshRecords();
            } catch {
              Alert.alert(t("workout_log.delete_set_failed"));
              setReloadKey((key) => key + 1);
            }
          },
        },
      ]
    );
  };

  // Back returns to the screen that opened the log (the workout session or
  // the Plan tab). Opened with nothing underneath — a restored or linked
  // screen — go to the workout it belongs to, or the Plan tab.
  const handleBack = () => {
    Keyboard.dismiss();
    if (router.canGoBack()) {
      router.back();
    } else if (fromSession && sessionIndexNumber !== null) {
      router.replace({ pathname: "/workout-session", params: { sessionIndex: String(sessionIndexNumber) } });
    } else {
      router.replace("/(tabs)/plan");
    }
  };

  if (!user) {
    return (
      <SafeScreen edges={["top"]} style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.loadErrorText}>{t("workout_log.could_not_load")}</Text>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        {/* From the guided session, Back returns to it — say so. */}
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.backButton, labelledBack && styles.backButtonLabelled]}
          accessibilityRole="button"
          accessibilityLabel={t(fromSession ? "workout_log.back_to_workout" : "workout_log.back")}
        >
          <Ionicons name="chevron-back" size={20} color={coachColors.card} />
          {labelledBack ? <Text style={styles.backLabel}>{t("workout_log.workout")}</Text> : null}
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t("workout_log.title")}</Text>
          <Text style={styles.headerContext} numberOfLines={1}>
            {sessionIndexNumber !== null
              ? t("workout_log.context", { number: sessionIndexNumber + 1, exercise: exerciseName })
              : exerciseName}
          </Text>
        </View>
        <View style={{ width: labelledBack ? 96 : 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={coachColors.coral} />
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.loadErrorText}>{t("workout_log.could_not_load")}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setReloadKey((key) => key + 1)}>
            <Text style={styles.retryButtonText}>{t("workout_log.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
        >
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <Text style={styles.prescription}>{t("workout_log.planned_sets_reps", { count: plannedSetCount, min: repMin, max: repMax })}</Text>
          <Text style={styles.loadHint}>{t(`workout_log.load_hint.${load}`)}</Text>

          <View style={styles.tableCard}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.yourSets}>{t("workout_log.your_sets")}</Text>
              <View style={styles.tableHeaderRight}>
                {load !== "none" ? (
                  <Text style={styles.personalBest}>
                    {t(lowerIsBetter ? "workout_log.least_assist" : "workout_log.personal_best", { value: formatWeight(prKg, unit, t) })}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => setEditing((value) => !value)}
                  style={styles.editToggle}
                  accessibilityRole="button"
                  accessibilityState={{ selected: editing }}
                  hitSlop={8}
                >
                  <Text style={styles.editToggleText}>{t(editing ? "workout_log.edit_done" : "workout_log.edit_sets")}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.columnHeaderRow}>
              <Text style={[styles.columnHeader, styles.colPr]}>{t("workout_log.pr")}</Text>
              <Text style={[styles.columnHeader, styles.colSet]}>{t("workout_log.set")}</Text>
              <Text style={[styles.columnHeader, styles.colReps]}>{t("workout_log.reps")}</Text>
              <Text style={[styles.columnHeader, styles.colWeight]}>{t(`workout_log.weight_column.${load}`)}</Text>
              <Text style={[styles.columnHeader, styles.colDone]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {t(editing ? "workout_log.remove" : "workout_log.done")}
              </Text>
            </View>

            {sets.map((set, index) => (
              <View key={set.setNumber} style={styles.setRow}>
                <Text
                  style={[styles.colPr, styles.prText]}
                  accessibilityLabel={t("workout_log.pr_label", {
                    set: set.setNumber,
                    value: setRecords.has(set.setNumber) ? formatWeight(setRecords.get(set.setNumber)!, unit, t) : t("workout_log.no_pr_spoken"),
                  })}
                >
                  {setRecords.has(set.setNumber) ? formatWeight(setRecords.get(set.setNumber)!, unit, t) : t("workout_log.no_pr")}
                </Text>
                <Text style={[styles.colSet, styles.setNumberText]} accessibilityLabel={t("workout_log.set_label", { set: set.setNumber })}>
                  {set.setNumber}
                </Text>
                <View style={styles.colReps}>
                  <TextInput
                    style={styles.cellInput}
                    value={set.reps}
                    onChangeText={(value) => setSets((prev) => prev.map((s, i) => (i === index ? { ...s, reps: value.replace(/[^0-9]/g, "") } : s)))}
                    onBlur={() => persistSet(set)}
                    keyboardType="number-pad"
                    maxLength={3}
                    inputAccessoryViewID={Platform.OS === "ios" ? SET_KEYBOARD_BAR : undefined}
                    accessibilityLabel={t("workout_log.reps_label", { set: set.setNumber })}
                  />
                </View>
                <View style={[styles.colWeight, styles.weightCell]}>
                  <TextInput
                    style={[styles.cellInput, styles.weightInput]}
                    value={set.weightValue}
                    onChangeText={(value) =>
                      setSets((prev) => prev.map((s, i) => (i === index ? { ...s, weightValue: cleanWeightInput(value) } : s)))
                    }
                    onBlur={() => persistSet(set)}
                    onSubmitEditing={() => Keyboard.dismiss()}
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={Platform.OS === "ios" ? SET_KEYBOARD_BAR : undefined}
                    placeholder={t(`workout_log.weight_placeholder.${load}`)}
                    placeholderTextColor={coachColors.textSecondary}
                    maxLength={6}
                    accessibilityLabel={t("workout_log.weight_label", { set: set.setNumber })}
                  />
                  <Text style={styles.unitSuffix}>{unit}</Text>
                </View>
                <View style={styles.colDone}>
                  {editing ? (
                    <TouchableOpacity
                      onPress={() => handleDeleteSet(set)}
                      style={styles.removeButton}
                      accessibilityRole="button"
                      accessibilityLabel={t("workout_log.delete_set_label", { set: set.setNumber })}
                      hitSlop={8}
                    >
                      <Ionicons name="remove" size={18} color={DARK_TEXT} />
                    </TouchableOpacity>
                  ) : set.saving ? (
                    <ActivityIndicator size="small" color={coachColors.textSecondary} accessibilityLabel={t("workout_log.saving")} />
                  ) : set.error ? (
                    // Not saved: the values stay as typed; tap to try again.
                    <TouchableOpacity
                      onPress={() => persistSet(set)}
                      style={styles.retryCheck}
                      accessibilityRole="button"
                      accessibilityLabel={t("workout_log.retry_set_label", { set: set.setNumber })}
                      hitSlop={8}
                    >
                      <Ionicons name="refresh" size={16} color={coachColors.coral} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleToggleDone(set)}
                      style={[styles.doneCheck, set.completed && styles.doneCheckChecked]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: set.completed }}
                      accessibilityLabel={t(set.completed ? "workout_log.done_label" : "workout_log.done_label_unchecked", { set: set.setNumber })}
                      hitSlop={8}
                    >
                      {set.completed ? <Ionicons name="checkmark" size={16} color={coachColors.card} /> : null}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {/* Right under the last set, inside the table, so it's in reach
                while entering reps/weight — not at the bottom of the page. */}
            <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet} accessibilityRole="button">
              <Ionicons name="add" size={18} color={DARK_TEXT} />
              <Text style={styles.addSetText}>{t("workout_log.add_set")}</Text>
            </TouchableOpacity>

            <Text style={styles.prFootnote}>{t("workout_log.pr_footnote")}</Text>

            {sets.some((s) => s.error) ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={coachColors.coral} />
                <Text style={styles.errorText}>{t("workout_log.save_error")}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const errored = sets.find((s) => s.error);
                    if (errored) persistSet(errored);
                  }}
                >
                  <Text style={styles.errorRetry}>{t("workout_log.retry")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* Previous values are suggestions: copied rows stay unconfirmed
              until each is ticked Done. */}
          {previousSets.length > 0 && !sets.some((s) => s.completed) ? (
            <TouchableOpacity style={styles.quietButton} onPress={handleUsePrevious} accessibilityRole="button" accessibilityHint={t("workout_log.use_previous_hint")}>
              <Ionicons name="copy-outline" size={16} color={DARK_TEXT} />
              <Text style={styles.quietButtonText}>{t("workout_log.use_previous")}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Low-emphasis: done without logging weights/reps. */}
          {quickDone || (completedExerciseIds.includes(exerciseId) && !sets.some((s) => s.completed)) ? (
            <View style={styles.quickDoneNote}>
              <Ionicons name="checkmark-circle" size={16} color={coachColors.lime} />
              <Text style={styles.quickDoneText}>{t("workout_log.quick_done_note")}</Text>
            </View>
          ) : !sets.some((s) => s.completed) ? (
            <TouchableOpacity onPress={handleQuickComplete} accessibilityRole="button" style={styles.quickDoneLink} hitSlop={8}>
              <Text style={styles.quickDoneLinkText}>{t("workout_log.quick_done")}</Text>
            </TouchableOpacity>
          ) : null}

          {journalOn && user ? (
            <WorkoutExtras userId={user.id} units={unit} sessionId={workoutSessionId} ensureSession={ensureSession} />
          ) : null}

          {guide ? <ExerciseLearningCard guide={guide} embedded /> : null}
        </ScrollView>
      )}

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={SET_KEYBOARD_BAR}>
          <View style={styles.keyboardBar}>
            <TouchableOpacity style={styles.keyboardBarAdd} onPress={handleAddSet} accessibilityRole="button">
              <Ionicons name="add" size={18} color={DARK_TEXT} />
              <Text style={styles.addSetText}>{t("workout_log.add_set")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.keyboardBarDone}>{t("workout_log.keyboard_done")}</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}
    </SafeScreen>
  );
}

const DARK_BG = "#0d0d0e";
const DARK_PANEL = "#181819";
const DARK_BORDER = "rgba(255,255,255,0.12)";
const DARK_TEXT = "#f7f7f7";
const DARK_MUTED = "rgba(255,255,255,0.62)";

const styles = StyleSheet.create({
  screen: { backgroundColor: DARK_BG },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  loadErrorText: { color: DARK_MUTED, fontFamily: coachFonts.body, fontSize: 14, textAlign: "center" },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1, borderColor: DARK_BORDER },
  retryButtonText: { color: DARK_TEXT, fontFamily: coachFonts.bodyBold },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: DARK_TEXT, fontFamily: coachFonts.headingSemiBold, fontSize: 17, textAlign: "center" },
  headerCenter: { flex: 1, alignItems: "center", paddingHorizontal: spacing.sm },
  headerContext: { color: DARK_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 12, marginTop: 1 },
  backButtonLabelled: { width: 96, flexDirection: "row", gap: 2, paddingRight: 8 },
  backLabel: { color: DARK_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  retryCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: coachColors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  prFootnote: { color: DARK_MUTED, fontFamily: coachFonts.body, fontSize: 12, marginTop: spacing.xs },
  quietButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: DARK_BORDER,
    marginTop: -spacing.sm,
  },
  quietButtonText: { color: DARK_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  quickDoneLink: { alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: -spacing.sm },
  quickDoneLinkText: { color: DARK_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 13, textDecorationLine: "underline" },
  quickDoneNote: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", marginTop: -spacing.sm },
  quickDoneText: { color: DARK_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 40, gap: spacing.lg },
  exerciseName: { color: DARK_TEXT, fontFamily: coachFonts.headingExtraBold, fontSize: 28, marginTop: spacing.xs },
  prescription: {
    color: DARK_MUTED,
    fontFamily: coachFonts.bodySemiBold,
    fontSize: 14,
    backgroundColor: DARK_PANEL,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  tableCard: {
    backgroundColor: DARK_PANEL,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: DARK_BORDER,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tableHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  yourSets: { color: DARK_TEXT, fontFamily: coachFonts.headingSemiBold, fontSize: 19 },
  tableHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  editToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1, borderColor: DARK_BORDER },
  editToggleText: { color: DARK_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 12 },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  loadHint: { color: DARK_MUTED, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19, marginTop: -spacing.sm },
  personalBest: { color: DARK_MUTED, fontFamily: coachFonts.body, fontSize: 13 },
  columnHeaderRow: { flexDirection: "row", alignItems: "center", paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: DARK_BORDER },
  columnHeader: { color: DARK_MUTED, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  colPr: { width: 56 },
  colSet: { width: 36 },
  colReps: { flex: 1, minWidth: 56 },
  colWeight: { flex: 1.3, minWidth: 76 },
  colDone: { width: 48, alignItems: "center" },
  setRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, gap: 4 },
  prText: { color: DARK_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 14, fontVariant: ["tabular-nums"] },
  setNumberText: { color: DARK_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 15, fontVariant: ["tabular-nums"] },
  cellInput: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: DARK_BORDER,
    color: DARK_TEXT,
    fontFamily: coachFonts.bodyBold,
    fontSize: 15,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  weightCell: { flexDirection: "row", alignItems: "center", gap: 6 },
  weightInput: { flex: 1, minWidth: 0 },
  unitSuffix: { color: DARK_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 12 },
  doneCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: DARK_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  doneCheckChecked: { backgroundColor: coachColors.lime, borderColor: coachColors.lime },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: spacing.sm },
  errorText: { flex: 1, color: coachColors.coral, fontFamily: coachFonts.body, fontSize: 12 },
  errorRetry: { color: coachColors.coral, fontFamily: coachFonts.bodyBold, fontSize: 12, textDecorationLine: "underline" },
  addSetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.28)",
    marginTop: spacing.xs,
  },
  keyboardBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: DARK_PANEL,
    borderTopWidth: 1,
    borderTopColor: DARK_BORDER,
  },
  keyboardBarAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  keyboardBarDone: { color: coachColors.coral, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
  addSetText: { color: DARK_TEXT, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
});

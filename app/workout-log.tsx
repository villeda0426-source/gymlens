// Workout Log — docs/design/workout-log-implementation-handoff.md.
// Entered from a Plan-tab exercise row (app/(tabs)/plan.tsx's
// handleOpenExercise); returns there when dismissed. Not the active-workout
// timer (app/workout-session.tsx) — that screen is untouched.
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
  findTodayInstance,
  fetchPersonalRecordKg,
  fromKg,
  updateSetNumber,
  upsertSet,
  type WorkoutLogContext,
  type WorkoutSetRow,
} from "@/lib/workoutSetLogs";
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
  }>();
  const { user } = useAuthStore();
  const { plan, markExerciseCompleted, unmarkExerciseCompleted } = useCoachTrainerStore();
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
    }),
    [user?.id, exerciseId, exerciseName, params.threadId, params.sessionIndex, params.sessionLabel, params.planWeek]
  );

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [sets, setSets] = useState<LocalSet[]>([]);
  const [prKg, setPrKg] = useState<number | null>(null);
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
        const [instance, pr] = await Promise.all([
          findTodayInstance(ctx),
          fetchPersonalRecordKg(user.id, exerciseId, lowerIsBetter),
        ]);
        if (cancelled) return;

        if (instance) {
          setInstanceId(instance.instanceId);
          setSets(instance.sets.map(toLocalSet));
          wasFullyCompleted.current = instance.sets
            .slice(0, plannedSetCount)
            .every((row) => row.completed) && instance.sets.length >= plannedSetCount;
        } else {
          setInstanceId(Crypto.randomUUID());
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
        setPrKg(pr);
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
    } else if (!allDone && wasFullyCompleted.current) {
      wasFullyCompleted.current = false;
      unmarkExerciseCompleted(exerciseId);
    }
  };

  // Takes the row to save explicitly (by setNumber, not array index) rather
  // than reading it back out of `sets` — handleAddSet needs to persist a row
  // in the same tick it appends it, before a re-render could make a fresh
  // `sets` closure available, so looking it up here would silently read a
  // stale (pre-append) array and crash on undefined.
  const persistSet = async (target: LocalSet) => {
    if (!instanceId || !user?.id) return;
    setSets((prev) => prev.map((s) => (s.setNumber === target.setNumber ? { ...target, saving: true, error: false } : s)));

    const reps = target.reps.trim() === "" ? null : Math.max(0, Math.min(500, Math.round(Number(target.reps))));
    const weightValue = target.weightValue.trim() === "" ? null : Math.max(0, Number(target.weightValue));

    try {
      const saved = await upsertSet(ctx, instanceId, {
        setNumber: target.setNumber,
        reps,
        weightValue,
        weightUnit: target.weightUnit,
        completed: target.completed,
      });
      setSets((prev) => {
        const next = prev.map((s) => (s.setNumber === target.setNumber ? { ...toLocalSet(saved), saving: false } : s));
        syncPlanCompletion(next);
        return next;
      });
      if (weightValue !== null) {
        fetchPersonalRecordKg(user.id, exerciseId, lowerIsBetter).then(setPrKg).catch(() => undefined);
      }
    } catch {
      setSets((prev) => prev.map((s) => (s.setNumber === target.setNumber ? { ...target, saving: false, error: true } : s)));
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
    Alert.alert(
      t("workout_log.delete_set_title", { set: target.setNumber }),
      t(target.completed ? "workout_log.delete_set_message_done" : "workout_log.delete_set_message"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("workout_log.delete_set_confirm"),
          style: "destructive",
          onPress: async () => {
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
              if (user?.id) fetchPersonalRecordKg(user.id, exerciseId, lowerIsBetter).then(setPrKg).catch(() => undefined);
            } catch {
              Alert.alert(t("workout_log.delete_set_failed"));
              setReloadKey((key) => key + 1);
            }
          },
        },
      ]
    );
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t("workout_log.back")}>
          <Ionicons name="chevron-back" size={20} color={coachColors.card} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("workout_log.title")}</Text>
        <View style={{ width: 40 }} />
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
              <Text style={[styles.columnHeader, styles.colDone]}>{t(editing ? "workout_log.remove" : "workout_log.done")}</Text>
            </View>

            {sets.map((set, index) => (
              <View key={set.setNumber} style={styles.setRow}>
                <Text
                  style={[styles.colPr, styles.prText]}
                  accessibilityLabel={t("workout_log.pr_label", { set: set.setNumber })}
                >
                  {formatWeight(prKg, unit, t)}
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
                    style={styles.cellInput}
                    value={set.weightValue}
                    onChangeText={(value) =>
                      setSets((prev) => prev.map((s, i) => (i === index ? { ...s, weightValue: value.replace(/[^0-9.]/g, "") } : s)))
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
                    <ActivityIndicator size="small" color={coachColors.textSecondary} />
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
  headerTitle: { color: DARK_TEXT, fontFamily: coachFonts.headingSemiBold, fontSize: 17 },
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import GuestPromptModal from "@/components/UI/GuestPromptModal";
import MuscleGainToast, { MuscleGain } from "@/components/Avatar/MuscleGainToast";
import WorkoutSummaryModal, { MuscleSummaryEntry } from "@/components/Avatar/WorkoutSummaryModal";
import WorkoutFeedbackModal from "@/components/Coach/WorkoutFeedbackModal";
import DetailTabBar from "@/components/Equipment/DetailTabBar";
import MuscleGroupTags from "@/components/Equipment/MuscleGroupTags";
import MuscleMapView from "@/components/Equipment/MuscleMapView";
import SafetyTips from "@/components/Equipment/SafetyTips";
import TutorialSteps from "@/components/Equipment/TutorialSteps";
import VideoList, { VideoItem } from "@/components/Equipment/VideoList";
import { colors, fonts } from "@/constants/theme";
import { apiFetch } from "@/lib/api";
import {
  CoachPlan,
  evaluateCoachWorkout,
  getCoachTrainerJob,
  startCoachTrainerJob,
} from "@/lib/coachTrainer";
import type { WorkoutFeedback } from "@/lib/coachingEngine";
import { supabase } from "@/lib/supabase";
import {
  AvatarMuscleGroup,
} from "@/lib/muscleProgress";
import { useAuthStore } from "@/store/authStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { useWorkoutGuideStore } from "@/store/workoutGuideStore";
import { MuscleDelta, useMuscleProgressStore } from "@/store/muscleProgressStore";

type PlanExercise = CoachPlan["sessions"][number]["exercises"][number];
type ExerciseGuide = {
  exercise: string;
  targetMuscles: string[];
  steps: string[];
  safetyTips: string[];
  found: boolean;
};
type GuideSubject = ExerciseGuide & { id: string };
type GuideTab = "tutorial" | "safety" | "videos" | "calculator";
type Level = "Beginner" | "Intermediate" | "Advanced";

const NEXT_PLAN_JOB_TIMEOUT_MS = 240000;

async function waitForNextPlan(jobId: string, authToken: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < NEXT_PLAN_JOB_TIMEOUT_MS) {
    const job = await getCoachTrainerJob(jobId, { authToken });
    if (job.status === "completed" && job.result) return job.result;
    if (job.status === "failed") throw new Error(job.error || "Next plan generation failed.");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Next plan generation timed out.");
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAN_CARD_WIDTH = SCREEN_WIDTH - 40;
const PLAN_CARD_GAP = 12;
const PLAN_DARK = "#0d0d0e";
const PLAN_PANEL = "#181819";
const PLAN_PANEL_SOFT = "#222224";
const PLAN_BORDER = "rgba(255,255,255,0.12)";
const PLAN_MUTED = "rgba(255,255,255,0.62)";
const PLAN_TEXT = "#f7f7f7";
const LEVEL_MULTIPLIERS: Record<Level, number> = { Beginner: 1, Intermediate: 1.35, Advanced: 1.65 };

function estimateLoadFactor(muscles: string[]): number {
  const normalized = muscles.map((muscle) => muscle.toLowerCase());
  if (normalized.some((muscle) => /quad|hamstring|glute|leg|calf/.test(muscle))) return 0.38;
  if (normalized.some((muscle) => /back|lat|trap|pull/.test(muscle))) return 0.3;
  if (normalized.some((muscle) => /chest|shoulder|tricep|push/.test(muscle))) return 0.24;
  if (normalized.some((muscle) => /core|abs|oblique/.test(muscle))) return 0.12;
  return 0.25;
}

function dayName(index: number): string {
  return DAY_NAMES[index % DAY_NAMES.length];
}

function uniqueMuscles(exercises: PlanExercise[]): string[] {
  const seen = new Set<string>();
  for (const exercise of exercises) {
    for (const muscle of exercise.primary_muscles) {
      if (muscle) seen.add(muscle);
    }
  }
  return Array.from(seen).slice(0, 4);
}

function isSessionComplete(session: CoachPlan["sessions"][number], completedIds: string[]): boolean {
  return session.exercises.length > 0 && session.exercises.every((exercise) => completedIds.includes(exercise.exercise_id));
}

function fallbackExerciseGuide(exercise: PlanExercise, isEs: boolean): ExerciseGuide {
  const dose = isEs
    ? `${exercise.sets} series de ${exercise.rep_range.min}-${exercise.rep_range.max} repeticiones`
    : `${exercise.sets} sets of ${exercise.rep_range.min}-${exercise.rep_range.max} reps`;
  return {
    exercise: exercise.name,
    targetMuscles: exercise.primary_muscles,
    found: true,
    steps: [
      isEs ? `Prepárate para ${exercise.name} con control antes de la primera repetición.` : `Set up for ${exercise.name} with control before the first rep.`,
      isEs ? `${dose}. Usa ${exercise.target_load || "una carga que puedas controlar"} y mantén un movimiento fluido.` : `${dose}. Use ${exercise.target_load || "a load you can control"} and keep the movement smooth.`,
      exercise.coach_notes || exercise.progression_rule || (isEs ? "Detén la serie si pierdes la técnica." : "Stop the set if form breaks down."),
    ].filter(Boolean),
    safetyTips: [
      isEs ? "Comienza con menos peso del que crees necesitar hasta dominar el movimiento." : "Start lighter than you think you need until the movement feels clean.",
      isEs ? "Haz que los músculos objetivo realicen el trabajo sin apresurar las repeticiones." : "Keep the target muscles doing the work instead of rushing through reps.",
      exercise.target_rpe ? (isEs ? `Mantén el esfuerzo cerca de RPE ${exercise.target_rpe}.` : `Keep effort around RPE ${exercise.target_rpe}.`) : (isEs ? "Deja algunas repeticiones buenas en reserva." : "Leave a few good reps in reserve."),
    ],
  };
}

function fallbackStretchGuide(id: string, name: string, targetMuscles: string[], isEs: boolean): GuideSubject {
  return {
    id,
    exercise: name,
    targetMuscles,
    found: true,
    steps: [
      isEs ? `Entra en ${name} gradualmente, con respiración lenta y control.` : `Ease into ${name} with slow breathing and a controlled setup.`,
      isEs ? "Muévete en un rango cómodo durante 30-45 segundos sin forzar el estiramiento." : "Move through a comfortable range for 30-45 seconds without forcing the stretch.",
      isEs ? "Repite una vez más si la zona sigue tensa antes de la primera serie de trabajo." : "Repeat once more if the target area still feels tight before your first working set.",
    ],
    safetyTips: [
      isEs ? "Mantén el estiramiento suave y sin dolor." : "Keep the stretch gentle and pain-free.",
      isEs ? "Evita los rebotes y no contengas la respiración." : "Avoid bouncing or holding your breath.",
      isEs ? "Reduce la intensidad si sientes pellizcos, entumecimiento o molestias articulares." : "Back off if you feel pinching, numbness, or joint discomfort.",
    ],
  };
}

function PlanEmptyState() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View style={styles.emptyPlan}>
      <View style={styles.emptyIcon}>
        <Ionicons name="chatbubbles" size={28} color={colors.coral} />
      </View>
      <Text style={styles.emptyTitle}>{t("plan.empty_title")}</Text>
      <Text style={styles.emptyText}>{t("plan.empty_text")}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/trainer")} activeOpacity={0.86}>
        <Text style={styles.primaryButtonText}>{t("plan.create_with_coach")}</Text>
      </TouchableOpacity>
    </View>
  );
}

interface WorkoutDayCardProps {
  session: CoachPlan["sessions"][number];
  index: number;
  completedIds: string[];
  completingId: string | null;
  onCompleteExercise: (exercise: PlanExercise) => void;
  onUncompleteExercise: (exercise: PlanExercise) => void;
  onOpenWorkout: (session: CoachPlan["sessions"][number], index: number) => void;
  onOpenExercise: (exercise: PlanExercise) => void;
  onOpenStretch: (stretch: string, label: string, targetMuscles: string[]) => void;
}

function WorkoutDayCard({
  session,
  index,
  completedIds,
  completingId,
  onCompleteExercise,
  onUncompleteExercise,
  onOpenWorkout,
  onOpenExercise,
  onOpenStretch,
}: WorkoutDayCardProps) {
  const { t } = useTranslation();
  const completedCount = session.exercises.filter((exercise) => completedIds.includes(exercise.exercise_id)).length;
  const isComplete = completedCount === session.exercises.length && session.exercises.length > 0;
  const muscles = uniqueMuscles(session.exercises);

  const stretches = recommendedStretchKeys(session);

  return (
    <LinearGradient
      colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.025)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.dayCard, isComplete && styles.dayCardComplete]}
    >
      <TouchableOpacity style={styles.dayHeader} onPress={() => onOpenWorkout(session, index)} activeOpacity={0.82}>
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{dayName(index)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.dayTitle}>{session.day_label.replace(/^Day\s*\d+\s*[-–]\s*/i, "")}</Text>
          <Text style={styles.dayMeta}>
            {session.estimated_minutes} {t("plan.min")} · {session.exercises.length} {t("plan.exercises")}
          </Text>
        </View>
        <View style={[styles.statusPill, isComplete && styles.statusPillComplete]}>
          <Text style={[styles.statusText, isComplete && styles.statusTextComplete]}>
            {isComplete ? t("plan.done") : `${completedCount}/${session.exercises.length}`}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => onOpenWorkout(session, index)} activeOpacity={0.82}>
        <Text style={styles.dayFocus}>{session.focus}</Text>
      </TouchableOpacity>

      <View style={styles.muscleChips}>
        {muscles.map((muscle) => (
          <View key={muscle} style={styles.muscleChip}>
            <Text style={styles.muscleChipText}>{muscle}</Text>
          </View>
        ))}
      </View>

      <View style={styles.prepBlock}>
        <Text style={styles.prepLabel}>{t("plan.preworkout_stretches")}</Text>
        {stretches.map((stretch) => (
          <TouchableOpacity
            key={stretch}
            style={styles.prepRow}
            activeOpacity={0.78}
            onPress={() => onOpenStretch(stretch, t(`plan.stretch.${stretch}`), muscles)}
          >
            <View style={styles.prepIcon}>
              <Ionicons name="body" size={16} color={colors.ndGold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.prepName}>{t(`plan.stretch.${stretch}`)}</Text>
              <Text style={styles.prepMeta}>{t("plan.prep_meta")}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {session.exercises.map((exercise) => {
        const isDone = completedIds.includes(exercise.exercise_id);
        const isCompleting = completingId === exercise.exercise_id;
        return (
          <View key={exercise.exercise_id} style={styles.exerciseRow}>
            <TouchableOpacity
              style={[styles.exerciseCheck, isDone && styles.exerciseCheckDone]}
              disabled={isCompleting}
              onPress={() => (isDone ? onUncompleteExercise(exercise) : onCompleteExercise(exercise))}
            >
              {isCompleting ? (
                <ActivityIndicator size="small" color={colors.coral} />
              ) : isDone ? (
                <Ionicons name="checkmark" size={15} color={colors.white} />
              ) : (
                <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenExercise(exercise)} activeOpacity={0.78}>
              <Text style={[styles.exerciseName, isDone && styles.exerciseDoneText]}>{exercise.name}</Text>
              <Text style={styles.exerciseDose}>
                {exercise.sets} sets · {exercise.rep_range.min}-{exercise.rep_range.max} reps · {exercise.target_load}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onOpenExercise(exercise)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={18} color={PLAN_MUTED} />
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity
        style={[styles.startButton, isComplete && styles.startButtonComplete]}
        onPress={() => onOpenWorkout(session, index)}
        disabled={isComplete}
      >
        <Ionicons name={isComplete ? "checkmark-circle" : "reader"} size={17} color={isComplete ? colors.lime : colors.white} />
        <Text style={[styles.startButtonText, isComplete && styles.startButtonTextComplete]}>
          {isComplete ? t("plan.workout_complete") : t("plan.open_workout_details")}
        </Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

function ExerciseGuideModal({
  visible,
  subject,
  guide,
  loading,
  onClose,
}: {
  visible: boolean;
  subject: GuideSubject | null;
  guide: ExerciseGuide | null;
  loading: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<GuideTab>("tutorial");
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosFetched, setVideosFetched] = useState(false);
  const [bodyWeight, setBodyWeight] = useState("");
  const [useLbs, setUseLbs] = useState(true);
  const [level, setLevel] = useState<Level>("Beginner");
  const resolvedGuide = guide ?? subject;

  useEffect(() => {
    if (visible) {
      setActiveTab("tutorial");
      setVideos([]);
      setVideosFetched(false);
      setVideosLoading(false);
    }
  }, [visible, subject?.id]);

  const fetchVideos = async () => {
    if (!resolvedGuide?.exercise) return;
    setVideosLoading(true);
    try {
      const params = new URLSearchParams({ name: resolvedGuide.exercise });
      const data = await apiFetch<VideoItem[]>(`/api/videos?${params.toString()}`, {}, 15000);
      setVideos(data);
    } catch {
      // Server unavailable, keep the empty video state.
    } finally {
      setVideosLoading(false);
      setVideosFetched(true);
    }
  };

  useEffect(() => {
    if (visible && activeTab === "videos" && !videosFetched) {
      fetchVideos();
    }
  }, [visible, activeTab, videosFetched, resolvedGuide?.exercise]);

  if (!subject || !resolvedGuide) return null;

  const calcWeight = (): string => {
    const weight = parseFloat(bodyWeight);
    if (!weight) return t("equipment.enter_weight");
    const load = weight * estimateLoadFactor(resolvedGuide.targetMuscles) * LEVEL_MULTIPLIERS[level];
    return `${Math.max(5, Math.round(load / 5) * 5)} ${useLbs ? "lbs" : "kg"}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeScreen edges={["top"]} style={styles.guideSafe}>
        <View style={styles.guideHeader}>
          <TouchableOpacity onPress={onClose} style={styles.detailClose}>
            <Ionicons name="close" size={22} color={PLAN_TEXT} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.guideMuscleMap}>
            <MuscleMapView muscleGroups={resolvedGuide.targetMuscles} />
          </View>

          <View style={styles.guideContent}>
            <View style={styles.guideBadge}>
              <Text style={styles.guideBadgeText}>{t("equipment.ai_workout_guide")}</Text>
            </View>
            <Text style={styles.guideTitle}>{resolvedGuide.exercise}</Text>

            {resolvedGuide.targetMuscles.length > 0 ? (
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>{t("equipment.muscle_groups")}</Text>
                <MuscleGroupTags groups={resolvedGuide.targetMuscles} />
              </View>
            ) : null}

            {loading ? (
              <View style={styles.guideLoading}>
                <ActivityIndicator color={colors.coral} />
                <Text style={styles.guideLoadingText}>{t("plan.loading_exercise_guide")}</Text>
              </View>
            ) : (
              <>
                <DetailTabBar
                  tabs={[
                    { key: "tutorial", label: t("equipment.tutorial") },
                    { key: "safety", label: t("equipment.safety_short") },
                    { key: "videos", label: t("equipment.videos") },
                    { key: "calculator", label: t("equipment.calculator") },
                  ]}
                  activeTab={activeTab}
                  onChange={(key) => setActiveTab(key as GuideTab)}
                />
                {activeTab === "tutorial" ? (
                  <TutorialSteps
                    steps={resolvedGuide.steps.map((instruction, index) => ({ step: index + 1, instruction }))}
                  />
                ) : null}
                {activeTab === "safety" ? (
                  <SafetyTips tips={resolvedGuide.safetyTips} />
                ) : null}
                {activeTab === "videos" ? (
                  <VideoList
                    videos={videos}
                    loading={videosLoading}
                    fetched={videosFetched}
                    onRetry={() => {
                      setVideosFetched(false);
                      fetchVideos();
                    }}
                  />
                ) : null}
                {activeTab === "calculator" ? (
                  <View style={styles.guideCalculator}>
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
                      <View style={styles.calcLevelRow}>
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
                      <Text style={styles.calcNote}>{t("equipment.calc_note")}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </SafeScreen>
    </Modal>
  );
}

function recommendedStretchKeys(session: CoachPlan["sessions"][number]): string[] {
  const muscles = uniqueMuscles(session.exercises).join(" ").toLowerCase();
  if (/quad|hamstring|glute|calf|leg/.test(muscles)) {
    return ["walking_lunges", "hip_flexor", "squat_pry"];
  }
  if (/chest|pec|tricep|shoulder/.test(muscles)) {
    return ["arm_circles", "doorway", "scap_pushups"];
  }
  if (/back|lat|trap|bicep/.test(muscles)) {
    return ["cat_cow", "lat_stretch", "band_pull"];
  }
  return ["worlds_greatest", "jumping_jacks", "inchworm"];
}

function WorkoutDetailModal({
  visible,
  session,
  completedIds,
  completingId,
  onClose,
  onCompleteExercise,
  onUncompleteExercise,
  onSwapExercise,
  onOpenExercise,
  onOpenStretch,
}: {
  visible: boolean;
  session: CoachPlan["sessions"][number] | null;
  completedIds: string[];
  completingId: string | null;
  onClose: () => void;
  onCompleteExercise: (exercise: PlanExercise) => void;
  onUncompleteExercise: (exercise: PlanExercise) => void;
  onSwapExercise: (exercise: PlanExercise, replacementName: string, scope: "today" | "permanent") => void;
  onOpenExercise: (exercise: PlanExercise) => void;
  onOpenStretch: (stretch: string, label: string, targetMuscles: string[]) => void;
}) {
  const { t } = useTranslation();
  if (!session) return null;
  const completedCount = session.exercises.filter((exercise) => completedIds.includes(exercise.exercise_id)).length;
  const stretches = recommendedStretchKeys(session);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeScreen edges={["top"]} style={styles.detailSafe}>
        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailEyebrow}>{t("plan.detail_eyebrow")}</Text>
              <Text style={styles.detailTitle}>{session.day_label.replace(/^Day\s*\d+\s*[-–]\s*/i, "")}</Text>
              <Text style={styles.detailMeta}>
                {session.estimated_minutes} {t("plan.min")} · {t("plan.complete_count", {
                  completed: completedCount,
                  total: session.exercises.length,
                })}
              </Text>
            </View>
            <TouchableOpacity style={styles.detailClose} onPress={onClose}>
              <Ionicons name="close" size={22} color={PLAN_TEXT} />
            </TouchableOpacity>
          </View>

          <View style={styles.detailPanel}>
            <Text style={styles.detailSectionTitle}>{t("plan.coach_focus")}</Text>
            <Text style={styles.detailBody}>{session.focus}</Text>
            <View style={styles.muscleChips}>
              {uniqueMuscles(session.exercises).map((muscle) => (
                <View key={muscle} style={styles.muscleChip}>
                  <Text style={styles.muscleChipText}>{muscle}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.detailPanel}>
            <Text style={styles.detailSectionTitle}>{t("plan.preworkout_stretches")}</Text>
            {stretches.map((stretch) => (
              <TouchableOpacity
                key={stretch}
                style={styles.detailExerciseCard}
                activeOpacity={0.78}
                onPress={() => onOpenStretch(stretch, t(`plan.stretch.${stretch}`), uniqueMuscles(session.exercises))}
              >
                <View style={styles.detailExerciseHeader}>
                  <View style={styles.prepIcon}>
                    <Ionicons name="body" size={16} color={colors.ndGold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailExerciseName}>{t(`plan.stretch.${stretch}`)}</Text>
                    <Text style={styles.detailExerciseDose}>{t("plan.prep_meta")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={PLAN_MUTED} />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.detailPanel}>
            <Text style={styles.detailSectionTitle}>{t("plan.exercises")}</Text>
            {session.exercises.map((exercise) => {
              const isDone = completedIds.includes(exercise.exercise_id);
              const isCompleting = completingId === exercise.exercise_id;
              return (
                <View key={exercise.exercise_id} style={styles.detailExerciseCard}>
                  <View style={styles.detailExerciseHeader}>
                    <TouchableOpacity
                      style={[styles.exerciseCheck, isDone && styles.exerciseCheckDone]}
                      disabled={isCompleting}
                      onPress={() => (isDone ? onUncompleteExercise(exercise) : onCompleteExercise(exercise))}
                    >
                      {isCompleting ? (
                        <ActivityIndicator size="small" color={colors.coral} />
                      ) : isDone ? (
                        <Ionicons name="checkmark" size={15} color={colors.white} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenExercise(exercise)} activeOpacity={0.78}>
                      <Text style={styles.detailExerciseName}>{exercise.name}</Text>
                      <Text style={styles.detailExerciseDose}>
                        {exercise.sets} sets · {exercise.rep_range.min}-{exercise.rep_range.max} reps · {t("plan.rest_minutes", {
                          count: Math.max(1, Math.round(exercise.rest_seconds / 60)),
                        })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onOpenExercise(exercise)} hitSlop={10}>
                      <Ionicons name="chevron-forward" size={18} color={PLAN_MUTED} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.detailBody}>{exercise.coach_notes}</Text>
                  <Text style={styles.detailSmall}>
                    {t("plan.target_line", {
                      muscles: exercise.primary_muscles.join(", "),
                      rpe: exercise.target_rpe ?? "auto",
                      load: exercise.target_load,
                    })}
                  </Text>
                  {exercise.substitutions.length > 0 ? (
                    <View style={styles.swapArea}>
                      <View style={styles.swapTitleRow}>
                        <Ionicons name="chatbubble-ellipses" size={13} color={colors.ndGold} />
                        <Text style={styles.swapTitle}>{t("plan.swap_same_goal")}</Text>
                      </View>
                      <Text style={styles.swapSubtitle}>{t("plan.swap_subtitle")}</Text>
                      {exercise.substitutions.slice(0, 2).map((replacement) => (
                        <TouchableOpacity
                          key={replacement}
                          style={styles.swapButton}
                          onPress={() => {
                            Alert.alert(t("plan.save_swap_title"), t("plan.save_swap_message", {
                              from: exercise.name,
                              to: replacement,
                            }), [
                              { text: t("common.cancel"), style: "cancel" },
                              { text: t("plan.only_today"), onPress: () => onSwapExercise(exercise, replacement, "today") },
                              { text: t("plan.plan_forward"), onPress: () => onSwapExercise(exercise, replacement, "permanent") },
                            ]);
                          }}
                        >
                          <Text style={styles.swapButtonText}>{replacement}</Text>
                          <Ionicons name="swap-horizontal" size={16} color={colors.ndGold} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeScreen>
    </Modal>
  );
}

function PlanOverviewModal({
  visible,
  plan,
  completedIds,
  visibleSessionCount,
  onClose,
  onSelectSession,
}: {
  visible: boolean;
  plan: CoachPlan | null;
  completedIds: string[];
  visibleSessionCount: number;
  onClose: () => void;
  onSelectSession: (session: CoachPlan["sessions"][number], index: number) => void;
}) {
  const { t } = useTranslation();
  if (!plan) return null;

  const totalSessions = plan.sessions.length;
  const completedSessions = plan.sessions.filter((session) =>
    session.exercises.every((exercise) => completedIds.includes(exercise.exercise_id))
  ).length;
  const overallProgress = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeScreen edges={["top"]} style={styles.detailSafe}>
        <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailEyebrow}>{t("plan.overview_eyebrow")}</Text>
              <Text style={styles.detailTitle}>{t("plan.overview_title")}</Text>
              <Text style={styles.detailMeta}>
                {t("plan.overview_duration", { weeks: plan.timeline_weeks, days: plan.days_per_week })}
                {" · "}
                {t("plan.overview_progress", { done: completedSessions, total: totalSessions })}
              </Text>
            </View>
            <TouchableOpacity style={styles.detailClose} onPress={onClose}>
              <Ionicons name="close" size={22} color={PLAN_TEXT} />
            </TouchableOpacity>
          </View>

          <View style={styles.overviewProgressTrack}>
            <View style={[styles.overviewProgressFill, { width: `${overallProgress}%` }]} />
          </View>

          <View style={styles.detailPanel}>
            {plan.sessions.map((session, index) => {
              const doneCount = session.exercises.filter((exercise) => completedIds.includes(exercise.exercise_id)).length;
              const isDone = session.exercises.length > 0 && doneCount === session.exercises.length;
              const isUpcoming = index >= visibleSessionCount;
              return (
                <TouchableOpacity
                  key={session.day_label}
                  activeOpacity={0.78}
                  onPress={() => onSelectSession(session, index)}
                  style={[styles.overviewRow, isUpcoming && styles.overviewRowUpcoming]}
                >
                  <View style={[styles.overviewBadge, isDone && styles.overviewBadgeDone]}>
                    {isDone ? (
                      <Ionicons name="checkmark" size={16} color={colors.white} />
                    ) : (
                      <Text style={styles.overviewBadgeText}>{dayName(index)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.overviewRowTitle}>
                      {session.day_label.replace(/^Day\s*\d+\s*[-–]\s*/i, "")}
                    </Text>
                    <Text style={styles.overviewRowMeta}>
                      {`${session.estimated_minutes} ${t("plan.min")} · ${doneCount}/${session.exercises.length} ${t("plan.exercises")}`}
                      {isUpcoming ? " · Upcoming" : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={PLAN_MUTED} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeScreen>
    </Modal>
  );
}

export default function PlanScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    plan,
    setPlan,
    completedExerciseIds,
    updatePlan,
    markExerciseCompleted,
    unmarkExerciseCompleted,
    addConversationMessage,
    latestWorkoutReview,
    setLatestWorkoutReview,
    enterCoachChat,
    activeThreadId,
    selectThread,
    hasLoaded,
    loadTrainer,
  } = useCoachTrainerStore();
  const completeExercise = useMuscleProgressStore((state) => state.completeExercise);
  const setCurrentWorkoutGuide = useWorkoutGuideStore((state) => state.setCurrentGuide);

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [gains, setGains] = useState<MuscleGain[]>([]);
  const [sessionDeltas, setSessionDeltas] = useState<MuscleDelta[]>([]);
  const [muscleSummary, setMuscleSummary] = useState<MuscleSummaryEntry[]>([]);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  const [selectedSession, setSelectedSession] = useState<CoachPlan["sessions"][number] | null>(null);
  const [workoutDetailVisible, setWorkoutDetailVisible] = useState(false);
  const [overviewVisible, setOverviewVisible] = useState(false);
  const [selectedGuideSubject, setSelectedGuideSubject] = useState<GuideSubject | null>(null);
  const [exerciseGuideVisible, setExerciseGuideVisible] = useState(false);
  const [exerciseGuide, setExerciseGuide] = useState<ExerciseGuide | null>(null);
  const [exerciseGuideLoading, setExerciseGuideLoading] = useState(false);
  const [feedbackSession, setFeedbackSession] = useState<CoachPlan["sessions"][number] | null>(null);
  const [feedbackSessions, setFeedbackSessions] = useState<CoachPlan["sessions"]>([]);
  const [feedbackWeekNumber, setFeedbackWeekNumber] = useState(1);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackPlanComplete, setFeedbackPlanComplete] = useState(false);
  const planScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadTrainer();
  }, [loadTrainer]);

  const totalExercises = plan?.sessions.reduce((sum, session) => sum + session.exercises.length, 0) ?? 0;
  const completedThisPlan = completedExerciseIds.length;
  const planProgress = totalExercises > 0 ? Math.round((completedThisPlan / totalExercises) * 100) : 0;
  const isFullPlanComplete = totalExercises > 0 && planProgress >= 100;
  const weekSize = Math.max(1, Math.round(plan?.days_per_week || 1));

  const todaySessionIndex = useMemo(() => {
    if (!plan?.sessions.length) return 0;
    const nextIndex = plan.sessions.findIndex((session) =>
      session.exercises.some((exercise) => !completedExerciseIds.includes(exercise.exercise_id))
    );
    return nextIndex >= 0 ? nextIndex : 0;
  }, [plan?.sessions, completedExerciseIds]);

  const visibleSessionCount = useMemo(() => {
    if (!plan?.sessions.length) return 0;
    let leadingCompletedSessions = 0;
    for (const session of plan.sessions) {
      if (!isSessionComplete(session, completedExerciseIds)) break;
      leadingCompletedSessions += 1;
    }
    const unlockedWeeks = Math.floor(leadingCompletedSessions / weekSize) + 1;
    return Math.min(plan.sessions.length, unlockedWeeks * weekSize);
  }, [completedExerciseIds, plan?.sessions, weekSize]);

  const visibleSessions = useMemo(
    () => plan?.sessions.slice(0, visibleSessionCount) ?? [],
    [plan?.sessions, visibleSessionCount]
  );

  useEffect(() => {
    const nextIndex = Math.min(todaySessionIndex, Math.max(0, visibleSessionCount - 1));
    setActiveSessionIndex(nextIndex);
    requestAnimationFrame(() => {
      planScrollRef.current?.scrollTo({
        x: nextIndex * (PLAN_CARD_WIDTH + PLAN_CARD_GAP),
        animated: false,
      });
    });
  }, [todaySessionIndex, visibleSessionCount]);

  const highlightedSession = visibleSessions[activeSessionIndex] ?? visibleSessions[Math.min(todaySessionIndex, visibleSessions.length - 1)];
  const handlePlanMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (PLAN_CARD_WIDTH + PLAN_CARD_GAP));
    setActiveSessionIndex(Math.max(0, Math.min(nextIndex, Math.max(visibleSessions.length, 1) - 1)));
  };

  const handleOpenOverview = () => {
    if (!plan?.sessions.length) return;
    setOverviewVisible(true);
  };

  const handleSelectFromOverview = (session: CoachPlan["sessions"][number], index: number) => {
    setOverviewVisible(false);
    setActiveSessionIndex(Math.min(index, Math.max(visibleSessions.length - 1, 0)));
    handleOpenWorkout(session);
  };

  const handleCompleteExercise = async (exercise: PlanExercise) => {
    if (!user?.id) {
      setShowGuestPrompt(true);
      return;
    }
    if (completedExerciseIds.includes(exercise.exercise_id) || completingId) return;

    const completingSession = plan?.sessions.find((session) =>
      session.exercises.some((item) => item.exercise_id === exercise.exercise_id)
    ) ?? null;
    const completesWorkout = completingSession?.exercises.every((item) =>
      item.exercise_id === exercise.exercise_id || completedExerciseIds.includes(item.exercise_id)
    ) ?? false;
    const completesPlan = plan?.sessions.every((session) =>
      session.exercises.every((item) =>
        item.exercise_id === exercise.exercise_id || completedExerciseIds.includes(item.exercise_id)
      )
    ) ?? false;
    const completingSessionIndex = completingSession && plan
      ? plan.sessions.findIndex((session) => session === completingSession)
      : -1;
    const weekStart = completingSessionIndex >= 0
      ? Math.floor(completingSessionIndex / weekSize) * weekSize
      : 0;
    const weekSessions = plan?.sessions.slice(weekStart, weekStart + weekSize) ?? [];
    const completesWeek = weekSessions.length > 0 && weekSessions.every((session) =>
      session.exercises.every((item) =>
        item.exercise_id === exercise.exercise_id || completedExerciseIds.includes(item.exercise_id)
      )
    );

    setCompletingId(exercise.exercise_id);
    try {
      const deltas = await completeExercise(user.id, {
        slug: exercise.exercise_id,
        name: exercise.name,
        rawPrimaryMuscles: exercise.primary_muscles,
      });

      markExerciseCompleted(exercise.exercise_id);

      if (completingSession && completesWorkout) {
        setWorkoutDetailVisible(false);
      }

      if (completingSession && completesWeek) {
        setFeedbackPlanComplete(completesPlan);
        setFeedbackSessions(weekSessions);
        setFeedbackWeekNumber(Math.floor(weekStart / weekSize) + 1);
        setTimeout(() => setFeedbackSession(completingSession), 200);
      }

      if (deltas.length > 0) {
        setSessionDeltas((prev) => [...prev, ...deltas]);
        const batchId = `${Date.now()}`;
        const newGains: MuscleGain[] = deltas.map((delta) => ({
          id: `${batchId}-${delta.muscle_group}`,
          label: t(`avatar_progress.muscles.${delta.muscle_group}`),
          points: delta.total_delta,
        }));
        setGains((prev) => [...prev, ...newGains]);
        setTimeout(() => {
          setGains((prev) => prev.filter((gain) => !newGains.some((next) => next.id === gain.id)));
        }, 2200);
      }
    } finally {
      setCompletingId(null);
    }
  };

  const handleUncompleteExercise = (exercise: PlanExercise) => {
    unmarkExerciseCompleted(exercise.exercise_id);
    setSessionDeltas([]);
  };

  const handleOpenWorkout = (session: CoachPlan["sessions"][number]) => {
    setSelectedSession(session);
    setWorkoutDetailVisible(true);
  };

  const handleOpenExercise = async (exercise: PlanExercise) => {
    const fallback = { id: exercise.exercise_id, ...fallbackExerciseGuide(exercise, i18n.language?.startsWith("es") === true) };
    setCurrentWorkoutGuide(fallback);
    setWorkoutDetailVisible(false);
    requestAnimationFrame(() => router.push("/equipment/workout-result"));

    try {
      const guide = await apiFetch<ExerciseGuide>("/api/workout-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: exercise.name, language: i18n.language?.startsWith("es") ? "es" : "en" }),
      }, 30000);
      if (guide?.found && guide.steps?.length) {
        setCurrentWorkoutGuide(guide);
      }
    } catch {
      // Keep the local Coach-plan fallback visible when search is offline.
    }
  };

  const handleOpenStretch = async (stretch: string, label: string, targetMuscles: string[]) => {
    const fallback = fallbackStretchGuide(`stretch-${stretch}`, label, targetMuscles, i18n.language?.startsWith("es") === true);
    setCurrentWorkoutGuide(fallback);
    setWorkoutDetailVisible(false);
    requestAnimationFrame(() => router.push("/equipment/workout-result"));

    try {
      const guide = await apiFetch<ExerciseGuide>("/api/workout-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: label, language: i18n.language?.startsWith("es") ? "es" : "en" }),
      }, 30000);
      if (guide?.found && guide.steps?.length) {
        setCurrentWorkoutGuide(guide);
      }
    } catch {
      // Keep the local stretch fallback visible when search is offline.
    }
  };

  const handleSwapExercise = (exercise: PlanExercise, replacementName: string, scope: "today" | "permanent") => {
    if (!plan) return;
    let replacementId: string | null = null;
    const updatedSessions = plan.sessions.map((session) => {
      const isSelectedSession = selectedSession?.day_label === session.day_label;
      if (scope === "today" && !isSelectedSession) return session;
      return {
        ...session,
        exercises: session.exercises.map((item) => {
          const shouldReplace =
            scope === "permanent"
              ? item.exercise_id === exercise.exercise_id || item.name === exercise.name
              : item.exercise_id === exercise.exercise_id;
          if (!shouldReplace) return item;
          const nextId = `${item.exercise_id}-swap-${replacementName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          if (item.exercise_id === exercise.exercise_id) {
            replacementId = nextId;
          }
          return {
            ...item,
            exercise_id: nextId,
            name: replacementName,
            coach_notes: t("plan.swap_note", { from: exercise.name }),
          };
        }),
      };
    });
    const nextPlan = { ...plan, sessions: updatedSessions };
    updatePlan(nextPlan);
    if (replacementId && completedExerciseIds.includes(exercise.exercise_id)) {
      unmarkExerciseCompleted(exercise.exercise_id);
      markExerciseCompleted(replacementId);
    }
    const nextSelected = updatedSessions.find((session) => session.day_label === selectedSession?.day_label) ?? null;
    setSelectedSession(nextSelected);
  };

  const handleWorkoutSummary = () => {
    const byMuscle = new Map<AvatarMuscleGroup, MuscleSummaryEntry>();
    for (const delta of sessionDeltas) {
      const existing = byMuscle.get(delta.muscle_group);
      if (existing) {
        existing.totalPoints += delta.total_delta;
        existing.leveledUp = existing.leveledUp || delta.leveled_up;
      } else {
        byMuscle.set(delta.muscle_group, {
          group: delta.muscle_group,
          totalPoints: delta.total_delta,
          leveledUp: delta.leveled_up,
        });
      }
    }
    setMuscleSummary(Array.from(byMuscle.values()));
    setSessionDeltas([]);
    setSummaryVisible(true);
  };

  const handleContinueWithCoach = () => {
    if (activeThreadId) {
      selectThread(activeThreadId);
    } else {
      enterCoachChat();
    }
    router.push("/trainer");
  };

  const handleRetryCompletedPlan = () => {
    if (!plan?.sessions.length) return;
    setFeedbackSessions(plan.sessions);
    setFeedbackWeekNumber(Math.max(1, plan.timeline_weeks));
    setFeedbackPlanComplete(true);
    setFeedbackSession(plan.sessions[plan.sessions.length - 1]);
  };

  const handleSubmitFeedback = async (feedback: WorkoutFeedback) => {
    if (!plan) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setShowGuestPrompt(true);
      return;
    }

    setFeedbackSubmitting(true);
    let feedbackRecorded = false;
    try {
      const language = i18n.language?.startsWith("es") ? "es" as const : "en" as const;
      let result = await evaluateCoachWorkout(plan, feedback, {
        authToken: session.access_token,
        language,
      });
      feedbackRecorded = result.feedbackSaved;

      if (feedback.planComplete) {
        const job = await startCoachTrainerJob({
          mode: "adapt",
          units: plan.units,
          language,
          currentPlan: plan,
          logs: [{ latest_feedback: feedback, coaching_summary: result.summary }],
        }, { authToken: session.access_token });
        const nextPlanResponse = await waitForNextPlan(job.jobId, session.access_token);
        if (nextPlanResponse.status !== "plan_updated" && nextPlanResponse.status !== "plan_ready") {
          throw new Error("Coach did not return a progression plan.");
        }
        result = {
          ...result,
          source: "ai",
          reason: nextPlanResponse.summary,
          changes: nextPlanResponse.status === "plan_updated" ? nextPlanResponse.changes : [],
          plan: nextPlanResponse.plan,
          requiresUserConfirmation: false,
        };
      }
      const reviewMessage = [
        t("plan.review_for", { session: feedback.sessionLabel, reason: result.reason }),
        result.changes.length ? t("plan.follow_up_changes", { changes: result.changes.join(" ") }) : t("plan.follow_up_steady"),
        result.source === "rules"
          ? t("plan.rules_decision")
          : t("plan.ai_decision"),
      ].join("\n\n");
      setLatestWorkoutReview({
        sessionLabel: feedback.sessionLabel,
        source: result.source,
        reason: result.reason,
        changes: result.changes,
      });
      addConversationMessage({ role: "assistant", content: reviewMessage });
      enterCoachChat();
      const apply = () => {
        if (feedback.planComplete) {
          setPlan(result.plan);
        } else {
          updatePlan(result.plan);
        }
        setFeedbackSession(null);
        setFeedbackSessions([]);
        setFeedbackPlanComplete(false);
        Alert.alert(
          feedback.planComplete
            ? t("plan.next_block_ready")
            : result.source === "rules" ? t("plan.workout_recorded") : t("plan.feedback_reviewed"),
          `${result.reason}${result.changes.length ? `\n\n${result.changes.join("\n")}` : ""}`
        );
      };

      if (result.requiresUserConfirmation && result.changes.length > 0) {
        Alert.alert(t("plan.change_recommended"), `${result.reason}\n\n${result.changes.join("\n")}`, [
          { text: t("plan.keep_plan"), style: "cancel", onPress: () => setFeedbackSession(null) },
          { text: t("plan.apply_changes"), onPress: apply },
        ]);
      } else {
        apply();
      }
    } catch {
      Alert.alert(
        feedbackRecorded ? t("plan.feedback_saved_title") : t("plan.check_in_error_title"),
        feedbackRecorded ? t("plan.feedback_saved_retry") : t("plan.check_in_error_message")
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  if (!hasLoaded) {
    return (
      <SafeScreen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.coral} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top"]} style={styles.safe}>
      <MuscleGainToast gains={gains} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{t("plan.eyebrow")}</Text>
            <Text style={styles.title}>{t("plan.title")}</Text>
          </View>
          <TouchableOpacity style={styles.coachButton} onPress={handleContinueWithCoach}>
            <Ionicons name="chatbubble-ellipses" size={17} color={colors.coral} />
            <Text style={styles.coachButtonText}>{t("plan.coach")}</Text>
          </TouchableOpacity>
        </View>

        {plan ? (
          <>
            <LinearGradient
              colors={["rgba(255,255,255,0.075)", "rgba(255,255,255,0.025)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.planHero}
            >
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.82}
                onPress={() => highlightedSession && handleOpenWorkout(highlightedSession)}
              >
                <Text style={styles.planHeroEyebrow}>{t("plan.todays_workout")}</Text>
                <Text style={styles.planHeroTitle}>
                  {highlightedSession?.day_label.replace(/^Day\s*\d+\s*[-–]\s*/i, "") || plan.split}
                </Text>
                <Text style={styles.planHeroText}>
                  {highlightedSession
                    ? `${highlightedSession.focus} · ${highlightedSession.estimated_minutes} ${t("plan.min")} · ${highlightedSession.exercises.length} ${t("plan.exercises")}`
                    : plan.goal}
                </Text>
              </TouchableOpacity>
              <LinearGradient colors={[colors.coral, "#ff6b6b"]} style={styles.progressRing}>
                <Text style={styles.progressRingText}>{planProgress}%</Text>
              </LinearGradient>
            </LinearGradient>

            <View style={styles.timelineCard}>
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineTitle}>{t("plan.timeline_title")}</Text>
                <Text style={styles.timelineMeta}>
                  {t("plan.visible_days", { visible: visibleSessionCount, total: plan.sessions.length })}
                </Text>
              </View>
              <View style={styles.timelineDots}>
                {plan.sessions.map((session, index) => {
                  const isVisible = index < visibleSessionCount;
                  const isDone = isSessionComplete(session, completedExerciseIds);
                  return (
                    <View
                      key={session.day_label}
                      style={[styles.timelineDot, isVisible && styles.timelineDotVisible, isDone && styles.timelineDotDone]}
                    >
                      {!isVisible ? <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.55)" /> : null}
                    </View>
                  );
                })}
              </View>
              {visibleSessionCount < plan.sessions.length ? (
                <Text style={styles.timelineHint}>{t("plan.unlock_hint")}</Text>
              ) : (
                <Text style={styles.timelineHint}>{t("plan.all_unlocked_hint")}</Text>
              )}
            </View>

            <ScrollView
              ref={planScrollRef}
              horizontal
              pagingEnabled
              directionalLockEnabled
              decelerationRate="fast"
              snapToInterval={PLAN_CARD_WIDTH + PLAN_CARD_GAP}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.planSlider}
              onMomentumScrollEnd={handlePlanMomentumEnd}
            >
              {visibleSessions.map((session, index) => (
                <WorkoutDayCard
                  key={session.day_label}
                  session={session}
                  index={index}
                  completedIds={completedExerciseIds}
                  completingId={completingId}
                  onCompleteExercise={handleCompleteExercise}
                  onUncompleteExercise={handleUncompleteExercise}
                  onOpenWorkout={handleOpenWorkout}
                  onOpenExercise={handleOpenExercise}
                  onOpenStretch={handleOpenStretch}
                />
              ))}
            </ScrollView>

            <View style={styles.planDots}>
              {visibleSessions.map((session, index) => (
                <View
                  key={session.day_label}
                  style={[styles.planDot, activeSessionIndex === index && styles.planDotActive]}
                />
              ))}
            </View>

            <TouchableOpacity
              style={styles.summaryButton}
              onPress={handleOpenOverview}
            >
              <Ionicons name="calendar" size={18} color={colors.coral} />
              <Text style={styles.summaryButtonText}>{t("plan.view_full_plan")}</Text>
              <Ionicons name="chevron-forward" size={18} color={PLAN_MUTED} />
            </TouchableOpacity>

            {sessionDeltas.length > 0 ? (
              <TouchableOpacity style={styles.progressSummaryButton} onPress={handleWorkoutSummary}>
                <Ionicons name="analytics" size={16} color={colors.ndGold} />
                <Text style={styles.progressSummaryText}>{t("plan.progress_summary")}</Text>
              </TouchableOpacity>
            ) : null}


            {latestWorkoutReview ? (
              <TouchableOpacity style={styles.coachReviewCard} onPress={handleContinueWithCoach} activeOpacity={0.82}>
                <View style={styles.coachReviewHeader}>
                  <View style={styles.coachReviewBadge}>
                    <Ionicons name="fitness" size={14} color={colors.white} />
                    <Text style={styles.coachReviewBadgeText}>{t("plan.coach_follow_up")}</Text>
                  </View>
                  <Text style={styles.coachReviewSource}>{t(latestWorkoutReview.source === "ai" ? "plan.ai_reviewed" : "plan.rules_reviewed")}</Text>
                </View>
                <Text style={styles.coachReviewTitle}>{latestWorkoutReview.sessionLabel}</Text>
                <Text style={styles.coachReviewText}>{latestWorkoutReview.reason}</Text>
                <Text style={styles.coachReviewChange}>
                  {latestWorkoutReview.changes.length
                    ? latestWorkoutReview.changes.join("\n")
                    : t("plan.steady_plan")}
                </Text>
                <View style={styles.coachReviewLink}>
                  <Text style={styles.coachReviewLinkText}>{t("plan.continue_coach")}</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.ndGold} />
                </View>
              </TouchableOpacity>
            ) : null}

            {isFullPlanComplete ? (
              <TouchableOpacity style={styles.feedbackCheckInCard} onPress={handleRetryCompletedPlan} activeOpacity={0.84}>
                <View style={styles.feedbackCheckInIcon}>
                  <Ionicons name="sparkles" size={19} color={colors.coral} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.feedbackCheckInTitle}>{t("plan.build_next_plan")}</Text>
                  <Text style={styles.feedbackCheckInText}>{t("plan.build_next_plan_text")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={PLAN_MUTED} />
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <PlanEmptyState />
        )}

      </ScrollView>

      <WorkoutSummaryModal
        visible={summaryVisible}
        onClose={() => setSummaryVisible(false)}
        exerciseCount={completedExerciseIds.length}
        muscleSummary={muscleSummary}
      />

      <WorkoutDetailModal
        visible={workoutDetailVisible}
        session={selectedSession}
        completedIds={completedExerciseIds}
        completingId={completingId}
        onClose={() => setWorkoutDetailVisible(false)}
        onCompleteExercise={handleCompleteExercise}
        onUncompleteExercise={handleUncompleteExercise}
        onSwapExercise={handleSwapExercise}
        onOpenExercise={handleOpenExercise}
        onOpenStretch={handleOpenStretch}
      />

      <WorkoutFeedbackModal
        visible={feedbackSession !== null}
        sessionLabel={feedbackPlanComplete ? t("coach_feedback.finished_plan") : t("plan.week_check_in", { count: feedbackWeekNumber })}
        workoutId={feedbackSession ? `week-${feedbackWeekNumber}:${feedbackSessions.flatMap((session) => session.exercises).map((exercise) => exercise.exercise_id).join(",")}` : ""}
        completedExerciseIds={feedbackSessions.flatMap((session) => session.exercises).filter((exercise) => completedExerciseIds.includes(exercise.exercise_id)).map((exercise) => exercise.exercise_id)}
        totalExerciseCount={feedbackSessions.reduce((total, session) => total + session.exercises.length, 0)}
        planComplete={feedbackPlanComplete}
        submitting={feedbackSubmitting}
        onClose={() => {
          setFeedbackSession(null);
          setFeedbackSessions([]);
          setFeedbackPlanComplete(false);
        }}
        onSubmit={handleSubmitFeedback}
      />

      <PlanOverviewModal
        visible={overviewVisible}
        plan={plan}
        completedIds={completedExerciseIds}
        visibleSessionCount={visibleSessionCount}
        onClose={() => setOverviewVisible(false)}
        onSelectSession={handleSelectFromOverview}
      />

      <GuestPromptModal
        visible={showGuestPrompt}
        onClose={() => setShowGuestPrompt(false)}
        onSignUp={() => {
          setShowGuestPrompt(false);
          router.push("/(auth)/register");
        }}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PLAN_DARK },
  scroll: { flex: 1, backgroundColor: PLAN_DARK },
  content: { paddingHorizontal: 20, paddingBottom: 34 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { color: PLAN_MUTED, fontFamily: fonts.bold, fontSize: 12, textTransform: "uppercase" },
  title: { color: PLAN_TEXT, fontFamily: fonts.heading, fontSize: 42 },
  coachButton: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: PLAN_TEXT,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  coachButtonText: { color: colors.coral, fontFamily: fonts.bold, fontSize: 13 },
  planHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: PLAN_PANEL,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    padding: 20,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  planHeroEyebrow: { color: colors.ndGold, fontFamily: fonts.extraBold, fontSize: 11, textTransform: "uppercase", marginBottom: 4 },
  planHeroTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 27 },
  planHeroText: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 6 },
  progressRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRingText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 20 },
  timelineCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    backgroundColor: PLAN_PANEL,
    padding: 14,
    marginBottom: 14,
  },
  timelineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  timelineTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 15 },
  timelineMeta: { color: colors.ndGold, fontFamily: fonts.extraBold, fontSize: 12 },
  timelineDots: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  timelineDot: {
    width: 25,
    height: 25,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotVisible: { backgroundColor: "rgba(255,255,255,0.16)", borderColor: "rgba(255,255,255,0.24)" },
  timelineDotDone: { backgroundColor: colors.lime, borderColor: colors.lime },
  timelineHint: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 10 },
  planSlider: { gap: PLAN_CARD_GAP, paddingBottom: 2 },
  planDots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 16 },
  planDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  planDotActive: { width: 18, backgroundColor: colors.coral },
  dayCard: {
    width: PLAN_CARD_WIDTH,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    padding: 16,
    marginBottom: 14,
    overflow: "hidden",
  },
  dayCardComplete: { borderColor: colors.lime + "70" },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(224,78,78,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeText: { color: colors.coral, fontFamily: fonts.extraBold, fontSize: 13 },
  dayTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 20 },
  dayMeta: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  statusPill: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillComplete: { backgroundColor: colors.lime + "18" },
  statusText: { color: "rgba(255,255,255,0.75)", fontFamily: fonts.bold, fontSize: 11 },
  statusTextComplete: { color: colors.lime },
  dayFocus: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 12 },
  muscleChips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  muscleChip: { borderRadius: 9, backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 9, paddingVertical: 5 },
  muscleChipText: { color: "rgba(255,255,255,0.78)", fontFamily: fonts.semiBold, fontSize: 11, textTransform: "capitalize" },
  prepBlock: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginTop: 12,
    paddingTop: 12,
    gap: 9,
  },
  prepLabel: { color: colors.ndGold, fontFamily: fonts.extraBold, fontSize: 11, textTransform: "uppercase" },
  prepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  prepIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ndGold + "16",
    borderWidth: 1,
    borderColor: colors.ndGold + "30",
  },
  prepName: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 14 },
  prepMeta: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  exerciseRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginTop: 12,
    paddingTop: 12,
  },
  exerciseCheck: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  exerciseCheckDone: { borderRadius: 21, backgroundColor: colors.lime },
  exerciseName: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 16 },
  exerciseDoneText: { color: PLAN_MUTED, textDecorationLine: "line-through" },
  exerciseDose: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, marginTop: 3 },
  startButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  startButtonComplete: { backgroundColor: colors.lime + "14", borderWidth: 1, borderColor: colors.lime + "50" },
  startButtonText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 14 },
  startButtonTextComplete: { color: colors.lime },
  summaryButton: {
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: PLAN_PANEL,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  summaryButtonText: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 16 },
  progressSummaryButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.ndGold + "45",
    backgroundColor: colors.ndGold + "14",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 18,
  },
  progressSummaryText: { color: colors.ndGold, fontFamily: fonts.bold, fontSize: 13 },
  emptyPlan: {
    backgroundColor: PLAN_PANEL,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    padding: 20,
    marginBottom: 18,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.coral + "14",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 20 },
  emptyText: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 16 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 14 },
  avatarCard: {
    backgroundColor: PLAN_PANEL,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    padding: 16,
    marginBottom: 14,
  },
  avatarHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" },
  avatarHeaderCopy: { flex: 1, minWidth: 180 },
  sectionTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 18 },
  sectionSubtitle: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  avatarPreview: { alignItems: "center", justifyContent: "center", minHeight: 286, marginTop: 8 },
  weekLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    borderRadius: 14,
    padding: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 5,
    backgroundColor: "#d9dbe8",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
  },
  legendSwatchActive: { backgroundColor: colors.coral },
  legendText: { color: PLAN_MUTED, fontFamily: fonts.semiBold, fontSize: 12 },
  workedMuscleChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  workedMuscleChip: {
    borderRadius: 10,
    backgroundColor: colors.coral + "18",
    borderWidth: 1,
    borderColor: colors.coral + "50",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  workedMuscleText: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 12 },
  noWorkedMuscles: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  detailSafe: { flex: 1, backgroundColor: PLAN_DARK },
  detailScroll: { flex: 1, backgroundColor: PLAN_DARK },
  detailContent: { padding: 20, paddingBottom: 34 },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  detailEyebrow: { color: colors.ndGold, fontFamily: fonts.extraBold, fontSize: 11, textTransform: "uppercase" },
  detailTitle: { color: PLAN_TEXT, fontFamily: fonts.heading, fontSize: 36, marginTop: 2 },
  detailMeta: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 13, marginTop: 4 },
  detailClose: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    backgroundColor: PLAN_PANEL,
    alignItems: "center",
    justifyContent: "center",
  },
  detailPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PLAN_BORDER,
    backgroundColor: PLAN_PANEL,
    padding: 15,
    marginBottom: 14,
  },
  finishWorkoutButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.coral,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 18,
  },
  finishWorkoutText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  feedbackCheckInCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.coral + "55",
    backgroundColor: colors.coral + "14",
    padding: 14,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  feedbackCheckInIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.coral + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackCheckInTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 14 },
  feedbackCheckInText: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  coachReviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.ndGold + "66",
    backgroundColor: PLAN_PANEL,
    padding: 16,
    marginTop: 12,
  },
  coachReviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  coachReviewBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.ndGold, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  coachReviewBadgeText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 10 },
  coachReviewSource: { color: PLAN_MUTED, fontFamily: fonts.semiBold, fontSize: 11 },
  coachReviewTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 16, marginTop: 13 },
  coachReviewText: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 5 },
  coachReviewChange: { color: PLAN_TEXT, fontFamily: fonts.semiBold, fontSize: 13, lineHeight: 19, marginTop: 10 },
  coachReviewLink: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
  coachReviewLinkText: { color: colors.ndGold, fontFamily: fonts.bold, fontSize: 13 },
  detailSectionTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 17, marginBottom: 8 },
  detailBody: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  stretchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  stretchText: { color: PLAN_TEXT, fontFamily: fonts.semiBold, fontSize: 13 },
  detailExerciseCard: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingTop: 13,
    marginTop: 13,
    gap: 9,
  },
  detailExerciseHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailExerciseName: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 16 },
  detailExerciseDose: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  detailSmall: { color: "rgba(255,255,255,0.52)", fontFamily: fonts.body, fontSize: 12, lineHeight: 17 },
  guideSafe: { flex: 1, backgroundColor: colors.bg },
  guideHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: colors.bg,
  },
  guideMuscleMap: {
    backgroundColor: colors.bg,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  guideContent: { padding: 20, paddingBottom: 34 },
  guideBadge: {
    backgroundColor: colors.lime + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  guideBadgeText: { color: colors.lime, fontSize: 11, fontFamily: fonts.semiBold },
  guideTitle: { color: colors.text, fontSize: 28, fontFamily: fonts.heading, marginBottom: 16, lineHeight: 34 },
  guideSection: { marginBottom: 20 },
  guideSectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  guideLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
  },
  guideLoadingText: { color: colors.textSecondary, fontFamily: fonts.semiBold, fontSize: 13 },
  guideCalculator: { gap: 12 },
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
  calcLevelRow: { flexDirection: "row", gap: 8 },
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
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 },
  resultKey: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
  resultVal: { color: colors.text, fontSize: 13, fontFamily: fonts.bold, flexShrink: 1, textAlign: "right" },
  calcNote: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body, lineHeight: 18, marginTop: 10 },
  swapArea: { gap: 8, marginTop: 4 },
  swapTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  swapTitle: { color: colors.ndGold, fontFamily: fonts.extraBold, fontSize: 11, textTransform: "uppercase" },
  swapSubtitle: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, lineHeight: 16, marginTop: -4 },
  swapButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.ndGold + "45",
    backgroundColor: colors.ndGold + "12",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  swapButtonText: { flex: 1, color: PLAN_TEXT, fontFamily: fonts.semiBold, fontSize: 13 },
  overviewProgressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: PLAN_PANEL_SOFT,
    overflow: "hidden",
    marginBottom: 18,
  },
  overviewProgressFill: { height: 8, borderRadius: 4, backgroundColor: colors.lime },
  overviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  overviewRowUpcoming: { opacity: 0.72 },
  overviewBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  overviewBadgeDone: { backgroundColor: colors.lime },
  overviewBadgeText: { color: PLAN_TEXT, fontFamily: fonts.extraBold, fontSize: 12 },
  overviewRowTitle: { color: PLAN_TEXT, fontFamily: fonts.bold, fontSize: 15 },
  overviewRowMeta: { color: PLAN_MUTED, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
});

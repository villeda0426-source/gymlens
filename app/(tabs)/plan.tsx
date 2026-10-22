import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect, useRouter } from "expo-router";
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
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import CoachIcon from "@/components/Coach/CoachIcon";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  buildPlanSequence,
  nextSequenceItem,
  nextWorkoutItem,
  sessionDisplayName,
  type PlanSequenceItem,
  type RestTipKey,
  restPreference,
} from "@/lib/planSequence";
import { useTabBarSpace } from "@/components/CoachTabBar";
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
import { isActiveFor, useActiveWorkoutStore } from "@/store/activeWorkoutStore";
import { exerciseLoad } from "@/lib/exerciseLoad";
import type { RestPreference } from "@/lib/coachTrainer";
import { findOrCreatePlanSession, findPlanSession, recordQuickCompletion, removeQuickCompletion } from "@/lib/workoutJournal";
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

// Light Coach Forward palette, same tokens as Home and Coach.
const PLAN_DARK = coachColors.bg;
const PLAN_PANEL = coachColors.card;
const PLAN_PANEL_SOFT = "#ebe7de";
const PLAN_BORDER = coachColors.border;
const PLAN_MUTED = coachColors.textSecondary;
const PLAN_TEXT = coachColors.text;
const LEVEL_MULTIPLIERS: Record<Level, number> = { Beginner: 1, Intermediate: 1.35, Advanced: 1.65 };

function estimateLoadFactor(muscles: string[]): number {
  const normalized = muscles.map((muscle) => muscle.toLowerCase());
  if (normalized.some((muscle) => /quad|hamstring|glute|leg|calf/.test(muscle))) return 0.38;
  if (normalized.some((muscle) => /back|lat|trap|pull/.test(muscle))) return 0.3;
  if (normalized.some((muscle) => /chest|shoulder|tricep|push/.test(muscle))) return 0.24;
  if (normalized.some((muscle) => /core|abs|oblique/.test(muscle))) return 0.12;
  return 0.25;
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
        <Ionicons name="chatbubbles" size={28} color={coachColors.coral} />
      </View>
      <Text style={styles.emptyTitle}>{t("plan.empty_title")}</Text>
      <Text style={styles.emptyText}>{t("plan.empty_text")}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/trainer")} activeOpacity={0.86}>
        <Text style={styles.primaryButtonText}>{t("plan.create_with_coach")}</Text>
      </TouchableOpacity>
    </View>
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
                <ActivityIndicator color={coachColors.coral} />
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
                          placeholderTextColor={coachColors.textSecondary}
                          keyboardType="numeric"
                          value={bodyWeight}
                          onChangeText={setBodyWeight}
                        />
                        <View style={styles.unitToggle}>
                          <Text style={[styles.unitText, useLbs && styles.unitActive]}>lbs</Text>
                          <Switch
                            value={!useLbs}
                            onValueChange={(value) => setUseLbs(!value)}
                            trackColor={{ false: coachColors.coral, true: coachColors.coral }}
                            thumbColor={coachColors.card}
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
  sessionNumber,
  onStart,
}: {
  visible: boolean;
  session: CoachPlan["sessions"][number] | null;
  sessionNumber: number | null;
  onStart: () => void;
  completedIds: string[];
  completingId: string | null;
  onClose: () => void;
  onCompleteExercise: (exercise: PlanExercise) => void;
  onUncompleteExercise: (exercise: PlanExercise) => void;
  onSwapExercise: (exercise: PlanExercise, replacementName: string, scope: "today" | "permanent") => void;
  onOpenExercise: (exercise: PlanExercise, session: CoachPlan["sessions"][number]) => void;
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
              <Text style={styles.detailEyebrow}>
                {sessionNumber ? t("plan.workout_number", { number: sessionNumber }) : t("plan.detail_eyebrow")}
              </Text>
              <Text style={styles.detailTitle}>{session.focus}</Text>
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

          {completedCount < session.exercises.length ? (
            <Pressable
              style={({ pressed }) => [styles.detailStartButton, pressed && styles.pressed]}
              onPress={onStart}
              accessibilityRole="button"
            >
              <Ionicons name="play" size={16} color={coachColors.card} />
              <Text style={styles.detailStartText}>{t(completedCount > 0 ? "plan.continue_workout" : "home.start_workout")}</Text>
            </Pressable>
          ) : null}

          <View style={styles.detailPanel}>
            <Text style={styles.detailSectionTitle}>{t("plan.coach_focus")}</Text>
            <Text style={styles.detailBody}>{sessionDisplayName(session)}</Text>
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
                    <Ionicons name="body" size={16} color={coachColors.coachGold} />
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
                        <ActivityIndicator size="small" color={coachColors.coral} />
                      ) : isDone ? (
                        <Ionicons name="checkmark" size={15} color={coachColors.card} />
                      ) : (
                        <Ionicons name="ellipse-outline" size={18} color={coachColors.textSecondary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => onOpenExercise(exercise, session)} activeOpacity={0.78}>
                      <Text style={styles.detailExerciseName}>{exercise.name}</Text>
                      <Text style={styles.detailExerciseDose}>
                        {t("plan.dose", { sets: exercise.sets, min: exercise.rep_range.min, max: exercise.rep_range.max })} · {t("plan.rest_minutes", {
                          count: Math.max(1, Math.round(exercise.rest_seconds / 60)),
                        })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onOpenExercise(exercise, session)} hitSlop={10}>
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
                        <Ionicons name="chatbubble-ellipses" size={13} color={coachColors.coachGold} />
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
                          <Ionicons name="swap-horizontal" size={16} color={coachColors.coachGold} />
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

function planTitle(plan: CoachPlan, t: (key: string, options?: Record<string, unknown>) => string): string {
  // Template plans store the goal as its key ("strength"); AI plans store
  // the person's own words.
  const known = ["strength", "hypertrophy", "fat_loss", "general_fitness"];
  if (known.includes(plan.goal)) return t(`plan.goal_names.${plan.goal}`);
  return plan.goal || t("plan.title");
}

const RING_SIZE = 76;
const RING_STROKE = 8;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ProgressRing({ progress }: { progress: number }) {
  const reduceMotion = useReduceMotion();
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const animated = useRef(new Animated.Value(reduceMotion ? progress : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      animated.setValue(progress);
      return;
    }
    Animated.timing(animated, {
      toValue: progress,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animated, progress, reduceMotion]);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} stroke={coachColors.bg} strokeWidth={RING_STROKE} fill="none" />
      <AnimatedCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={radius}
        stroke={coachColors.lime}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={animated.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </Svg>
  );
}

function PlanHeader({
  title,
  subtitle,
  completed,
  total,
  current,
  onCoach,
}: {
  title: string;
  subtitle: string;
  completed: number;
  total: number;
  current: number;
  onCoach: () => void;
}) {
  const { t } = useTranslation();
  const progress = total > 0 ? completed / total : 0;
  const allDone = total > 0 && completed >= total;
  return (
    <View style={styles.headerBlock}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>{t("plan.eyebrow")}</Text>
          <Text style={styles.planName} numberOfLines={2}>{title}</Text>
          <Text style={styles.planSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <TouchableOpacity
          style={styles.coachButton}
          onPress={onCoach}
          accessibilityRole="button"
          accessibilityLabel={t("plan.continue_coach")}
        >
          <CoachIcon size={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressCard}>
        <View style={styles.ringWrap}>
          <ProgressRing progress={progress} />
          <Text style={styles.ringPercent}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.progressTitle}>
            {allDone ? t("plan.all_workouts_done", { total }) : t("plan.workout_of", { current, total })}
          </Text>
          <Text style={styles.progressText}>
            {t("plan.done_to_go", { done: completed, left: Math.max(0, total - completed) })}
          </Text>
        </View>
      </View>
    </View>
  );
}

function NextWorkoutHero({
  item,
  resuming,
  onStart,
  onDetails,
}: {
  item: Extract<PlanSequenceItem, { type: "workout" }>;
  // A workout session is already open for this one (store/activeWorkoutStore).
  resuming: boolean;
  onStart: () => void;
  onDetails: () => void;
}) {
  const { t } = useTranslation();
  const { session } = item;
  const sets = session.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
  const name = sessionDisplayName(session);
  const inProgress = resuming || item.completedCount > 0;
  return (
    <View style={styles.hero}>
      <View style={styles.heroTopRow}>
        <Text style={styles.heroEyebrow}>
          {t(resuming ? "plan.in_progress_number" : "plan.up_next", { number: item.number }).toUpperCase()}
        </Text>
        {inProgress ? (
          <View style={styles.inProgressPill}>
            <Text style={styles.inProgressText}>
              {t("plan.complete_count", { completed: item.completedCount, total: session.exercises.length })}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.heroTitle}>{session.focus}</Text>
      {name !== session.focus ? <Text style={styles.heroSubtitle}>{name}</Text> : null}
      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue}>{session.exercises.length}</Text>
          <Text style={styles.heroStatLabel}>{t("home.today_exercises")}</Text>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue}>{sets}</Text>
          <Text style={styles.heroStatLabel}>{t("home.today_sets")}</Text>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroStatValue}>~{session.estimated_minutes}</Text>
          <Text style={styles.heroStatLabel}>{t("home.today_minutes")}</Text>
        </View>
      </View>
      <View style={styles.muscleChips}>
        {uniqueMuscles(session.exercises).map((muscle) => (
          <View key={muscle} style={styles.muscleChip}>
            <Text style={styles.muscleChipText}>{muscle}</Text>
          </View>
        ))}
      </View>
      <Pressable
        style={({ pressed }) => [styles.heroStartButton, pressed && styles.pressed]}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel={t(resuming ? "plan.resume_workout_number" : "plan.start_workout_number", { number: item.number })}
      >
        <Ionicons name="play" size={16} color={coachColors.card} />
        <Text style={styles.heroStartText}>
          {t(resuming ? "plan.resume_workout" : inProgress ? "plan.continue_workout" : "home.start_workout")}
        </Text>
      </Pressable>
      <TouchableOpacity style={styles.heroLink} onPress={onDetails} accessibilityRole="button">
        <Text style={styles.heroLinkText}>{t("plan.view_details")}</Text>
        <Ionicons name="chevron-forward" size={16} color={coachColors.text} />
      </TouchableOpacity>
    </View>
  );
}

// Where rest days go: the coach's recovery rules (default) or simply one a
// week. Only changes where rests appear — never the workouts or progress.
function RestPreferenceControl({ value, onChange }: { value: RestPreference; onChange: (value: RestPreference) => void }) {
  const { t } = useTranslation();
  const options: RestPreference[] = ["recovery", "weekly"];
  return (
    <View style={styles.restPref}>
      <View style={styles.restPrefRow}>
        <Text style={styles.restPrefLabel}>{t("plan.rest_preference.label")}</Text>
        <View style={styles.restPrefSegments} accessibilityRole="radiogroup">
          {options.map((option) => {
            const selected = option === value;
            return (
              <Pressable
                key={option}
                onPress={() => onChange(option)}
                style={[styles.restPrefSegment, selected && styles.restPrefSegmentSelected]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                hitSlop={4}
              >
                <Text style={[styles.restPrefSegmentText, selected && styles.restPrefSegmentTextSelected]} numberOfLines={1}>
                  {t(`plan.rest_preference.${option}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.restPrefHint}>{t(`plan.rest_preference.${value}_hint`)}</Text>
    </View>
  );
}

function RestHero({ tip, nextNumber, onStartAnyway }: { tip: RestTipKey; nextNumber: number; onStartAnyway: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.hero, styles.restHero]}>
      <View style={styles.restHeroIcon}>
        <Ionicons name="moon" size={24} color={coachColors.limeText} />
      </View>
      <Text style={[styles.heroEyebrow, styles.restEyebrow]}>{t("plan.up_next_rest").toUpperCase()}</Text>
      <Text style={styles.heroTitle}>{t("plan.rest_day")}</Text>
      <Text style={styles.restHeroText}>{t(`plan.rest_tips.${tip}`)}</Text>
      <Text style={styles.restHeroNext}>{t("plan.rest_then", { number: nextNumber })}</Text>
      <Pressable
        style={({ pressed }) => [styles.restHeroButton, pressed && styles.pressed]}
        onPress={onStartAnyway}
        accessibilityRole="button"
      >
        <Text style={styles.restHeroButtonText}>{t("plan.train_anyway", { number: nextNumber })}</Text>
      </Pressable>
    </View>
  );
}

function WorkoutRow({
  item,
  isNext,
  onPress,
}: {
  item: Extract<PlanSequenceItem, { type: "workout" }>;
  isNext: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { session } = item;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.workoutRow,
        isNext && styles.workoutRowNext,
        item.complete && styles.workoutRowDone,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${t("plan.workout_number", { number: item.number })}, ${session.focus}${item.complete ? `, ${t("plan.done")}` : ""}`}
    >
      <View style={[styles.rowBadge, isNext && styles.rowBadgeNext, item.complete && styles.rowBadgeDone]}>
        {item.complete ? (
          <Ionicons name="checkmark" size={18} color={coachColors.card} />
        ) : (
          <Text style={[styles.rowBadgeText, isNext && styles.rowBadgeTextNext]}>{item.number}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{t("plan.workout_number", { number: item.number })}</Text>
          {isNext ? (
            <View style={styles.nextPill}>
              <Text style={styles.nextPillText}>{t("plan.next")}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowFocus} numberOfLines={1}>{session.focus}</Text>
        <Text style={styles.rowMeta}>
          {t("plan.row_meta", { minutes: session.estimated_minutes, count: session.exercises.length })}
          {!item.complete && item.completedCount > 0 ? ` · ${item.completedCount}/${session.exercises.length}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={coachColors.textSecondary} />
    </Pressable>
  );
}

function RestRow({ tip, complete, isNext }: { tip: RestTipKey; complete: boolean; isNext: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.restRow, isNext && styles.restRowNext, complete && styles.workoutRowDone]}>
      <View style={styles.restBadge}>
        <Ionicons name={complete ? "checkmark" : "moon-outline"} size={16} color={coachColors.limeText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.restTitle}>{t("plan.rest_day")}</Text>
        <Text style={styles.restTip} numberOfLines={2}>{t(`plan.rest_tips.${tip}`)}</Text>
      </View>
    </View>
  );
}

export default function PlanScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const tabBarSpace = useTabBarSpace();
  const { user } = useAuthStore();
  const {
    plan,
    setPlan,
    completedExerciseIds,
    sessionCompletedAt,
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
    setRestPreference,
  } = useCoachTrainerStore();
  const completeExercise = useMuscleProgressStore((state) => state.completeExercise);
  const activeWorkout = useActiveWorkoutStore((state) => state.active);
  const loadActiveWorkout = useActiveWorkoutStore((state) => state.load);
  const setCurrentWorkoutGuide = useWorkoutGuideStore((state) => state.setCurrentGuide);

  const [completingId, setCompletingId] = useState<string | null>(null);
  const [gains, setGains] = useState<MuscleGain[]>([]);
  const [sessionDeltas, setSessionDeltas] = useState<MuscleDelta[]>([]);
  const [muscleSummary, setMuscleSummary] = useState<MuscleSummaryEntry[]>([]);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CoachPlan["sessions"][number] | null>(null);
  const [workoutDetailVisible, setWorkoutDetailVisible] = useState(false);
  const [selectedGuideSubject, setSelectedGuideSubject] = useState<GuideSubject | null>(null);
  const [exerciseGuideVisible, setExerciseGuideVisible] = useState(false);
  const [exerciseGuide, setExerciseGuide] = useState<ExerciseGuide | null>(null);
  const [exerciseGuideLoading, setExerciseGuideLoading] = useState(false);
  const [feedbackSession, setFeedbackSession] = useState<CoachPlan["sessions"][number] | null>(null);
  const [feedbackSessions, setFeedbackSessions] = useState<CoachPlan["sessions"]>([]);
  const [feedbackWeekNumber, setFeedbackWeekNumber] = useState(1);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackPlanComplete, setFeedbackPlanComplete] = useState(false);

  useEffect(() => {
    loadTrainer();
    loadActiveWorkout();
  }, [loadTrainer, loadActiveWorkout]);

  // Back from an exercise's Workout Log opened from a workout's details:
  // return to that workout, not the top of the Plan tab.
  const reopenWorkoutLabel = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const label = reopenWorkoutLabel.current;
      if (!label) return;
      reopenWorkoutLabel.current = null;
      const session = useCoachTrainerStore.getState().plan?.sessions.find((item) => item.day_label === label);
      if (session) {
        setSelectedSession(session);
        setWorkoutDetailVisible(true);
      }
    }, [])
  );

  const totalExercises = plan?.sessions.reduce((sum, session) => sum + session.exercises.length, 0) ?? 0;
  const completedThisPlan = completedExerciseIds.length;
  const planProgress = totalExercises > 0 ? Math.round((completedThisPlan / totalExercises) * 100) : 0;
  const isFullPlanComplete = totalExercises > 0 && planProgress >= 100;
  const weekSize = Math.max(1, Math.round(plan?.days_per_week || 1));

  // Workout 1, Workout 2, Rest, Workout 3... — order, not weekdays.
  const sequence = useMemo(
    () => (plan ? buildPlanSequence({ plan, completedExerciseIds, sessionCompletedAt }) : []),
    [plan, completedExerciseIds, sessionCompletedAt]
  );
  const nextItem = nextSequenceItem(sequence);
  const nextWorkout = nextWorkoutItem(sequence);
  // A workout already in progress outranks "up next" — it's what to finish.
  const activeItem = sequence.find(
    (item): item is Extract<PlanSequenceItem, { type: "workout" }> =>
      item.type === "workout" && !item.complete && isActiveFor(activeWorkout, activeThreadId ?? null, item.sessionIndex, item.session.day_label)
  );
  const heroWorkout = activeItem ?? nextWorkout;
  // Finished workouts (and rests already taken) before the current point
  // fold away so the list opens where you are.
  const firstOpenIndex = sequence.findIndex((item) => !item.complete);
  const hiddenDoneCount = firstOpenIndex > 0 ? sequence.slice(0, firstOpenIndex).filter((item) => item.type === "workout").length : 0;
  const [showCompleted, setShowCompleted] = useState(false);
  const visibleSequence = showCompleted || firstOpenIndex <= 0 ? sequence : sequence.slice(firstOpenIndex);
  const completedWorkouts = sequence.filter((item) => item.type === "workout" && item.complete).length;

  const selectedSessionIndex =
    selectedSession && plan ? plan.sessions.findIndex((session) => session.day_label === selectedSession.day_label) : -1;

  const handleStartWorkout = (sessionIndex: number) => {
    setWorkoutDetailVisible(false);
    requestAnimationFrame(() =>
      router.push({ pathname: "/workout-session", params: { sessionIndex: String(sessionIndex) } })
    );
  };

  // Review labels are stored as the session's internal label
  // ("Week 1 Day 2 - Upper A"); show the workout number instead.
  const reviewTitle = (label: string) => {
    const index = plan?.sessions.findIndex((session) => session.day_label === label) ?? -1;
    if (index < 0 || !plan) return label;
    return `${t("plan.workout_number", { number: index + 1 })} · ${sessionDisplayName(plan.sessions[index])}`;
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
      // This check-off is the quick completion: record "done" (no sets,
      // weights or records) on the workout, best effort.
      if (completingSession && completingSessionIndex >= 0) {
        recordPlanQuickCompletion(exercise, completingSessionIndex, completingSession.day_label, true);
      }

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

  const recordPlanQuickCompletion = (exercise: PlanExercise, sessionIndex: number, sessionLabel: string, done: boolean) => {
    if (!user?.id) return;
    const ref = {
      userId: user.id,
      threadId: activeThreadId ?? null,
      sessionIndex,
      sessionLabel,
      planWeek: Math.floor(sessionIndex / weekSize) + 1,
    };
    void (async () => {
      try {
        if (done) {
          const sessionId = await findOrCreatePlanSession(ref);
          if (sessionId) await recordQuickCompletion({ userId: ref.userId, sessionId, exerciseId: exercise.exercise_id, exerciseName: exercise.name });
        } else {
          const sessionId = await findPlanSession(ref);
          if (sessionId) await removeQuickCompletion(sessionId, exercise.exercise_id);
        }
      } catch {
        // Plan progress is already updated on the device; the journal entry is extra.
      }
    })();
  };

  const handleUncompleteExercise = (exercise: PlanExercise) => {
    unmarkExerciseCompleted(exercise.exercise_id);
    const sessionIndex = plan?.sessions.findIndex((session) => session.exercises.some((item) => item.exercise_id === exercise.exercise_id)) ?? -1;
    if (plan && sessionIndex >= 0) recordPlanQuickCompletion(exercise, sessionIndex, plan.sessions[sessionIndex].day_label, false);
    setSessionDeltas([]);
  };

  const handleOpenWorkout = (session: CoachPlan["sessions"][number]) => {
    setSelectedSession(session);
    setWorkoutDetailVisible(true);
  };

  // Workout Log handoff: a Plan-tab exercise tap opens the dedicated set-log
  // route instead of the standalone guide screen directly. Session context
  // (index/label/week) is derived here rather than threaded through every
  // prop layer — session is one of the same objects in plan.sessions.
  const handleOpenExercise = (exercise: PlanExercise, session: CoachPlan["sessions"][number]) => {
    // Seed the shared guide store with the same richer, target-load/RPE-aware
    // fallback the old direct-to-guide-screen flow used, so workout-log.tsx
    // has real content immediately instead of a thinner one it builds itself.
    const fallback = fallbackExerciseGuide(exercise, i18n.language?.startsWith("es") === true);
    setCurrentWorkoutGuide(fallback);
    reopenWorkoutLabel.current = session.day_label;
    setWorkoutDetailVisible(false);
    const sessionIndex = plan?.sessions.findIndex((item) => item.day_label === session.day_label) ?? -1;
    const planWeek = sessionIndex >= 0 ? Math.floor(sessionIndex / weekSize) + 1 : undefined;
    requestAnimationFrame(() =>
      router.push({
        pathname: "/workout-log",
        params: {
          exerciseId: exercise.exercise_id,
          exerciseName: exercise.name,
          plannedSetCount: String(exercise.sets),
          repMin: String(exercise.rep_range.min),
          repMax: String(exercise.rep_range.max),
          load: exerciseLoad({ id: exercise.exercise_id, name: exercise.name, category: exercise.category }),
          sessionLabel: session.day_label,
          sessionIndex: sessionIndex >= 0 ? String(sessionIndex) : undefined,
          planWeek: planWeek !== undefined ? String(planWeek) : undefined,
          threadId: activeThreadId ?? undefined,
        },
      })
    );
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
          <ActivityIndicator color={coachColors.coral} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top"]} style={styles.safe}>
      <MuscleGainToast gains={gains} />
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace }]} showsVerticalScrollIndicator={false}>
        {plan ? (
          <>
            <PlanHeader
              title={planTitle(plan, t)}
              subtitle={[t(`plan.goal_types.${plan.goal_type}`), plan.split, t("plan.per_week", { count: plan.days_per_week })].filter(Boolean).join(" · ")}
              completed={completedWorkouts}
              total={plan.sessions.length}
              current={heroWorkout ? heroWorkout.number : plan.sessions.length}
              onCoach={handleContinueWithCoach}
            />

            {nextItem?.type === "rest" && nextWorkout && !activeItem ? (
              <RestHero
                tip={nextItem.tip}
                nextNumber={nextWorkout.number}
                onStartAnyway={() => handleStartWorkout(nextWorkout.sessionIndex)}
              />
            ) : heroWorkout ? (
              <NextWorkoutHero
                item={heroWorkout}
                resuming={heroWorkout === activeItem}
                onStart={() => handleStartWorkout(heroWorkout.sessionIndex)}
                onDetails={() => handleOpenWorkout(heroWorkout.session)}
              />
            ) : (
              <TouchableOpacity style={styles.completeHero} onPress={handleRetryCompletedPlan} activeOpacity={0.88}>
                <View style={styles.completeHeroIcon}>
                  <Ionicons name="trophy" size={26} color={coachColors.coachGoldText} />
                </View>
                <Text style={styles.heroEyebrow}>{t("plan.complete_eyebrow").toUpperCase()}</Text>
                <Text style={styles.completeHeroTitle}>{t("plan.build_next_plan")}</Text>
                <Text style={styles.completeHeroText}>{t("plan.build_next_plan_text")}</Text>
                <View style={styles.heroStartButton}>
                  <Ionicons name="sparkles" size={16} color={coachColors.card} />
                  <Text style={styles.heroStartText}>{t("plan.build_next_plan_cta")}</Text>
                </View>
              </TouchableOpacity>
            )}

            {sessionDeltas.length > 0 ? (
              <TouchableOpacity style={styles.progressSummaryButton} onPress={handleWorkoutSummary}>
                <Ionicons name="analytics" size={16} color={coachColors.coachGoldText} />
                <Text style={styles.progressSummaryText}>{t("plan.progress_summary")}</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>{t("plan.your_workouts")}</Text>
              <Text style={styles.listSubtitle}>{t("plan.in_order_hint")}</Text>
            </View>

            {plan.sessions.length > 1 ? (
              <RestPreferenceControl value={restPreference(plan)} onChange={setRestPreference} />
            ) : null}

            <View style={styles.sequenceList}>
              {hiddenDoneCount > 0 ? (
                <TouchableOpacity
                  style={styles.completedToggle}
                  onPress={() => setShowCompleted((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showCompleted }}
                >
                  <Ionicons name="checkmark-circle" size={18} color={coachColors.limeText} />
                  <Text style={styles.completedToggleText}>
                    {t(showCompleted ? "plan.hide_completed" : "plan.show_completed", { count: hiddenDoneCount })}
                  </Text>
                  <Ionicons name={showCompleted ? "chevron-up" : "chevron-down"} size={16} color={coachColors.textSecondary} />
                </TouchableOpacity>
              ) : null}
              {visibleSequence.map((item, index) => {
                const showWeek = item.week !== visibleSequence[index - 1]?.week && plan.timeline_weeks > 1;
                return (
                  <React.Fragment key={item.key}>
                    {showWeek ? <Text style={styles.weekDivider}>{t("plan.week_label", { number: item.week })}</Text> : null}
                    {item.type === "workout" ? (
                      <WorkoutRow
                        item={item}
                        isNext={heroWorkout?.key === item.key && (!!activeItem || nextItem?.type !== "rest")}
                        onPress={() => handleOpenWorkout(item.session)}
                      />
                    ) : (
                      <RestRow tip={item.tip} complete={item.complete} isNext={nextItem?.key === item.key} />
                    )}
                  </React.Fragment>
                );
              })}
            </View>

            {latestWorkoutReview ? (
              <TouchableOpacity style={styles.coachReviewCard} onPress={handleContinueWithCoach} activeOpacity={0.82}>
                <View style={styles.coachReviewHeader}>
                  <View style={styles.coachReviewBadge}>
                    <CoachIcon size={14} />
                    <Text style={styles.coachReviewBadgeText}>{t("plan.coach_follow_up")}</Text>
                  </View>
                  <Text style={styles.coachReviewSource}>{t(latestWorkoutReview.source === "ai" ? "plan.ai_reviewed" : "plan.rules_reviewed")}</Text>
                </View>
                <Text style={styles.coachReviewTitle}>{reviewTitle(latestWorkoutReview.sessionLabel)}</Text>
                <Text style={styles.coachReviewText}>{latestWorkoutReview.reason}</Text>
                <Text style={styles.coachReviewChange}>
                  {latestWorkoutReview.changes.length
                    ? latestWorkoutReview.changes.join("\n")
                    : t("plan.steady_plan")}
                </Text>
                <View style={styles.coachReviewLink}>
                  <Text style={styles.coachReviewLinkText}>{t("plan.continue_coach")}</Text>
                  <Ionicons name="arrow-forward" size={16} color={coachColors.coachGoldText} />
                </View>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.emptyHeader}>
              <Text style={styles.eyebrow}>{t("plan.eyebrow")}</Text>
              <Text style={styles.title}>{t("plan.title")}</Text>
            </View>
            <PlanEmptyState />
          </>
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
        sessionNumber={selectedSessionIndex >= 0 ? selectedSessionIndex + 1 : null}
        onStart={() => {
          if (selectedSessionIndex >= 0) handleStartWorkout(selectedSessionIndex);
        }}
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
  safe: { flex: 1, backgroundColor: coachColors.bg },
  scroll: { flex: 1, backgroundColor: coachColors.bg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },

  // Header: plan name, goal, progress ring — Home's greeting-row rhythm.
  headerBlock: { gap: spacing.md },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingTop: spacing.xs },
  emptyHeader: { paddingTop: spacing.xs },
  eyebrow: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold, fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 30, marginTop: 2 },
  planName: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 30, lineHeight: 35, marginTop: 2, textTransform: "capitalize" },
  planSubtitle: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 14, marginTop: 2 },
  coachButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  progressCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: coachColors.card,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: coachColors.border,
    padding: spacing.lg,
  },
  ringWrap: { width: 76, height: 76, alignItems: "center", justifyContent: "center" },
  ringPercent: { position: "absolute", color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 17 },
  progressTitle: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 20 },
  progressText: { color: coachColors.limeText, fontFamily: coachFonts.bodyBold, fontSize: 13, letterSpacing: 0.4 },

  // Next workout hero — same card as Home's Today card.
  hero: {
    backgroundColor: coachColors.card,
    borderRadius: radii.cardLarge,
    padding: spacing.lg,
    gap: spacing.md,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: { boxShadow: "0 1px 2px rgba(12,35,64,0.06), 0 8px 20px rgba(12,35,64,0.05)" },
    }),
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  heroEyebrow: { color: coachColors.coral, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.4 },
  inProgressPill: { backgroundColor: coachColors.lime + "1f", borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  inProgressText: { color: coachColors.limeText, fontFamily: coachFonts.bodyBold, fontSize: 12 },
  heroTitle: { color: coachColors.text, fontFamily: coachFonts.headingExtraBold, fontSize: 34, lineHeight: 38, letterSpacing: -0.5 },
  heroSubtitle: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 14, marginTop: -6 },
  heroStats: { flexDirection: "row", gap: spacing.xl },
  heroStat: { gap: 2 },
  heroStatValue: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 24 },
  heroStatLabel: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  heroStartButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  heroStartText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 17 },
  heroLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 2 },
  heroLinkText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 14 },

  // Rest: softer — tinted, no shadow, no coral.
  restHero: {
    backgroundColor: "#eef6e0",
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 }, default: { boxShadow: "none" } }),
  },
  restHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  restEyebrow: { color: coachColors.limeText },
  restHeroText: { color: coachColors.text, fontFamily: coachFonts.body, fontSize: 16, lineHeight: 23 },
  restHeroNext: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  restHeroButton: {
    height: 48,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.limeText + "55",
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  restHeroButtonText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 15 },

  completeHero: {
    backgroundColor: coachColors.card,
    borderRadius: radii.cardLarge,
    borderWidth: 1.5,
    borderColor: coachColors.coachGold,
    padding: spacing.lg,
    gap: spacing.md,
  },
  completeHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coachGold + "26",
    alignItems: "center",
    justifyContent: "center",
  },
  completeHeroTitle: { color: coachColors.text, fontFamily: coachFonts.headingExtraBold, fontSize: 28 },
  completeHeroText: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21 },

  // Ordered list: Workout 1, Workout 2, Rest, Workout 3...
  listHeader: { gap: 2, marginTop: spacing.xs },
  listTitle: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 20 },
  listSubtitle: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 14 },
  sequenceList: { gap: spacing.sm },
  restPref: { gap: 6, marginTop: -spacing.xs },
  restPrefRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" },
  restPrefLabel: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  restPrefSegments: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  restPrefSegment: { minHeight: 38, paddingHorizontal: 14, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  restPrefSegmentSelected: { backgroundColor: coachColors.coachNavy },
  restPrefSegmentText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  restPrefSegmentTextSelected: { color: coachColors.card, fontFamily: coachFonts.bodyBold },
  restPrefHint: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 18 },
  weekDivider: {
    color: coachColors.textSecondary,
    fontFamily: coachFonts.bodyExtraBold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: spacing.sm,
  },
  workoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 76,
  },
  workoutRowNext: { borderColor: coachColors.coral, borderWidth: 1.5 },
  workoutRowDone: { opacity: 0.6 },
  rowBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBadgeNext: { backgroundColor: coachColors.coral },
  rowBadgeDone: { backgroundColor: coachColors.lime },
  rowBadgeText: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 16 },
  rowBadgeTextNext: { color: coachColors.card },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowTitle: { color: coachColors.text, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
  nextPill: { backgroundColor: coachColors.coral + "18", borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  nextPillText: { color: coachColors.coralPressed, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, letterSpacing: 0.6 },
  rowFocus: { color: coachColors.text, fontFamily: coachFonts.body, fontSize: 14, marginTop: 1 },
  rowMeta: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 12, marginTop: 2 },
  completedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: coachColors.card,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  completedToggleText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 14 },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#eef6e0",
    borderRadius: radii.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: coachColors.lime + "66",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  restRowNext: { borderStyle: "solid", borderWidth: 1.5, borderColor: coachColors.limeText },
  restBadge: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  restTitle: { color: coachColors.limeText, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
  restTip: { color: coachColors.text, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 18, marginTop: 2 },

  // Shared with the workout detail sheet.
  muscleChips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  muscleChip: { borderRadius: radii.pill, backgroundColor: coachColors.bg, paddingHorizontal: 10, paddingVertical: 5 },
  muscleChipText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 12, textTransform: "capitalize" },
  prepIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: coachColors.coachGold + "16",
    borderWidth: 1,
    borderColor: coachColors.coachGold + "30",
  },
  exerciseCheck: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: coachColors.bg },
  exerciseCheckDone: { borderRadius: 21, backgroundColor: coachColors.lime },
  progressSummaryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: coachColors.coachGold + "55",
    backgroundColor: coachColors.coachGold + "14",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  progressSummaryText: { color: coachColors.coachGoldText, fontFamily: coachFonts.bodyBold, fontSize: 13 },
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
    backgroundColor: coachColors.coral + "14",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 20 },
  emptyText: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 16 },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: coachColors.coral,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 14 },
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
  sectionTitle: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 18 },
  sectionSubtitle: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 12, lineHeight: 17, marginTop: 4 },
  avatarPreview: { alignItems: "center", justifyContent: "center", minHeight: 286, marginTop: 8 },
  weekLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: coachColors.bg,
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
    borderColor: coachColors.card,
  },
  legendSwatchActive: { backgroundColor: coachColors.coral },
  legendText: { color: PLAN_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 12 },
  workedMuscleChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  workedMuscleChip: {
    borderRadius: 10,
    backgroundColor: coachColors.coral + "18",
    borderWidth: 1,
    borderColor: coachColors.coral + "50",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  workedMuscleText: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 12 },
  noWorkedMuscles: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19 },
  detailSafe: { flex: 1, backgroundColor: PLAN_DARK },
  detailScroll: { flex: 1, backgroundColor: PLAN_DARK },
  detailContent: { padding: 20, paddingBottom: 34 },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  detailEyebrow: { color: coachColors.coachGoldText, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, textTransform: "uppercase" },
  detailTitle: { color: PLAN_TEXT, fontFamily: coachFonts.heading, fontSize: 32, lineHeight: 37, marginTop: 2 },
  detailStartButton: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: 14,
  },
  detailStartText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 16 },
  detailMeta: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 13, marginTop: 4 },
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
    backgroundColor: coachColors.coral,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginBottom: 18,
  },
  finishWorkoutText: { color: coachColors.card, fontFamily: coachFonts.bodyBold, fontSize: 15 },
  feedbackCheckInCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: coachColors.coral + "55",
    backgroundColor: coachColors.coral + "14",
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
    backgroundColor: coachColors.coral + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  feedbackCheckInTitle: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  feedbackCheckInText: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
  coachReviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: coachColors.coachGold + "66",
    backgroundColor: PLAN_PANEL,
    padding: 16,
  },
  coachReviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  coachReviewBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: coachColors.coachGold, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  coachReviewBadgeText: { color: coachColors.coachNavy, fontFamily: coachFonts.bodyExtraBold, fontSize: 10 },
  coachReviewSource: { color: PLAN_MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 11 },
  coachReviewTitle: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 16, marginTop: 13 },
  coachReviewText: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19, marginTop: 5 },
  coachReviewChange: { color: PLAN_TEXT, fontFamily: coachFonts.bodySemiBold, fontSize: 13, lineHeight: 19, marginTop: 10 },
  coachReviewLink: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
  coachReviewLinkText: { color: coachColors.coachGoldText, fontFamily: coachFonts.bodyBold, fontSize: 13 },
  detailSectionTitle: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 17, marginBottom: 8 },
  detailBody: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19 },
  stretchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  stretchText: { color: PLAN_TEXT, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  detailExerciseCard: {
    borderTopWidth: 1,
    borderTopColor: coachColors.border,
    paddingTop: 13,
    marginTop: 13,
    gap: 9,
  },
  detailExerciseHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailExerciseName: { color: PLAN_TEXT, fontFamily: coachFonts.bodyBold, fontSize: 16 },
  detailExerciseDose: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 12, marginTop: 2 },
  detailSmall: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 12, lineHeight: 17 },
  guideSafe: { flex: 1, backgroundColor: coachColors.bg },
  guideHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: coachColors.bg,
  },
  guideMuscleMap: {
    backgroundColor: coachColors.bg,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: coachColors.border,
  },
  guideContent: { padding: 20, paddingBottom: 34 },
  guideBadge: {
    backgroundColor: coachColors.lime + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  guideBadgeText: { color: coachColors.lime, fontSize: 11, fontFamily: coachFonts.bodySemiBold },
  guideTitle: { color: coachColors.text, fontSize: 28, fontFamily: coachFonts.heading, marginBottom: 16, lineHeight: 34 },
  guideSection: { marginBottom: 20 },
  guideSectionTitle: {
    color: coachColors.textSecondary,
    fontSize: 12,
    fontFamily: coachFonts.bodyBold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  guideLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: coachColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.border,
    padding: 16,
  },
  guideLoadingText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  guideCalculator: { gap: 12 },
  calcCard: {
    backgroundColor: coachColors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  calcLabel: { color: coachColors.textSecondary, fontSize: 11, fontFamily: coachFonts.bodyBold, textTransform: "uppercase", marginBottom: 10 },
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
  calcLevelRow: { flexDirection: "row", gap: 8 },
  levelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: coachColors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  levelBtnActive: { backgroundColor: coachColors.coral, borderColor: coachColors.coral },
  levelBtnText: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodySemiBold },
  levelBtnTextActive: { color: coachColors.card, fontFamily: coachFonts.bodyBold },
  resultsCard: {
    backgroundColor: coachColors.coral + "0d",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: coachColors.coral + "30",
  },
  resultsTitle: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyBold, textTransform: "uppercase", marginBottom: 8 },
  resultsWeight: { color: coachColors.coral, fontSize: 38, fontFamily: coachFonts.heading, marginBottom: 16 },
  resultsDivider: { height: 1, backgroundColor: coachColors.coral + "30", marginBottom: 16 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 },
  resultKey: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body },
  resultVal: { color: coachColors.text, fontSize: 13, fontFamily: coachFonts.bodyBold, flexShrink: 1, textAlign: "right" },
  calcNote: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.body, lineHeight: 18, marginTop: 10 },
  swapArea: { gap: 8, marginTop: 4 },
  swapTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  swapTitle: { color: coachColors.coachGoldText, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, textTransform: "uppercase" },
  swapSubtitle: { color: PLAN_MUTED, fontFamily: coachFonts.body, fontSize: 12, lineHeight: 16, marginTop: -4 },
  swapButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: coachColors.coachGold + "45",
    backgroundColor: coachColors.coachGold + "12",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  swapButtonText: { flex: 1, color: PLAN_TEXT, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
});

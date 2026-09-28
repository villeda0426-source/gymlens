// Coach Forward Equipment detail — Phase 6.
//
// Keeps every existing feature (save/share, confidence badge, category +
// difficulty tags, tutorial/safety/videos/workout-calculator tabs) — the
// mockup's single scroll with no tabs is a simplified illustration; the
// real screen has more to show than that mockup depicts, so tabs stay.
// Restyled inline (this screen doesn't use the shared DetailTabBar/
// TutorialSteps/SafetyTips/VideoList components — Plan and Avatar do, and
// those two screens are outside this redesign, so those shared files are
// deliberately left untouched rather than restyled here).
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  ActivityIndicator,
  Share,
  Animated,
  TextInput,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureScreen } from "react-native-view-shot";
import MuscleGroupTags from "@/components/Equipment/MuscleGroupTags";
import MuscleMapView from "@/components/Equipment/MuscleMapView";
import AskCoachCard from "@/components/Coach/AskCoachCard";
import { useEquipmentStore } from "@/store/equipmentStore";
import { useAuthStore } from "@/store/authStore";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { apiFetch } from "@/lib/api";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: coachColors.limeText,
  intermediate: "#c99700",
  advanced: coachColors.coral,
};

const TABS = ["tutorial", "safety", "videos", "workout"] as const;
type TabType = typeof TABS[number];

const LEVEL_MULTIPLIERS = { Beginner: 1.0, Intermediate: 1.4, Advanced: 1.8 };
export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isEs = i18n.language === "es";

  const { currentResult, toggleSave, loadSavedIds, savedIds } = useEquipmentStore();
  const { user } = useAuthStore();
  const authenticatedUserId = user?.id ?? null;

  const toastAnim = useRef(new Animated.Value(0)).current;
  const [toastMsg, setToastMsg] = useState("");

  const isResultRoute = id === "result";

  const [equipment, setEquipment] = useState<any>(isResultRoute ? currentResult : null);
  const [activeTab, setActiveTab] = useState<TabType>("tutorial");
  const [isLoading, setIsLoading] = useState(!isResultRoute);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const [videos, setVideos] = useState<any[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosFetched, setVideosFetched] = useState(false);

  // Workout calculator state
  const [bodyWeight, setBodyWeight] = useState("");
  const [useLbs, setUseLbs] = useState(true);
  const [level, setLevel] = useState<"Beginner" | "Intermediate" | "Advanced">("Beginner");
  const [weightFactor, setWeightFactor] = useState<number | null>(null);
  const [weightFactorLoading, setWeightFactorLoading] = useState(false);

  useEffect(() => {
    loadSavedIds(authenticatedUserId);
  }, [authenticatedUserId]);

  useEffect(() => {
    if (!isResultRoute && id) {
      fetchEquipment();
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === "videos" && !videosFetched && equipment) {
      fetchVideos(equipment.id, equipment.name);
    }
    if (activeTab === "workout" && equipment && weightFactor === null && !weightFactorLoading) {
      loadWeightFactor();
    }
  }, [activeTab, equipment]);

  // Pre-populate weightFactor from equipment data once loaded
  useEffect(() => {
    if (equipment?.weight_factor != null) {
      setWeightFactor(Number(equipment.weight_factor));
    }
  }, [equipment]);

  const fetchEquipment = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch(`/api/equipment/${id}`, {}, 12000);
      setEquipment(data);
    } catch (err: any) {
      setFetchError(err.message || t("equipment.could_not_load_equipment"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadWeightFactor = async () => {
    if (!equipment) return;
    if (equipment.weight_factor != null) {
      setWeightFactor(Number(equipment.weight_factor));
      return;
    }
    setWeightFactorLoading(true);
    try {
      const data = await apiFetch<{ weight_factor: number }>(`/api/equipment/${equipment.id}/weight-factor`, {}, 15000);
      setWeightFactor(Number(data.weight_factor) || 0.3);
    } catch {
      setWeightFactor(0.3);
    } finally {
      setWeightFactorLoading(false);
    }
  };

  const fetchVideos = async (equipmentId?: string, name?: string) => {
    if (!name) return;
    setVideosLoading(true);
    try {
      const params = new URLSearchParams({ name, language: isEs ? "es" : "en" });
      if (equipmentId) params.set("equipment_id", equipmentId);
      const data = await apiFetch<any[]>(`/api/videos?${params.toString()}`, {}, 15000);
      setVideos(data);
    } catch {
      // Server unavailable — leave videos empty
    } finally {
      setVideosLoading(false);
      setVideosFetched(true);
    }
  };

  const showToast = (message: string) => {
    setToastMsg(message);
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const handleSave = async () => {
    if (!equipment?.id) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await toggleSave(equipment, authenticatedUserId);
    if (result === "saved") showToast(t("equipment.saved_toast"));
    else if (result === "removed") showToast(t("equipment.removed_toast"));
    else showToast(t("equipment.save_try_again"));
  };

  const handleShare = async () => {
    if (!equipment) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = `Check out ${equipment.name} on SpotLift.\n${equipment.description || ""}`;

    try {
      const uri = await captureScreen({ format: "jpg", quality: 0.92 });
      const canShareFile = await Sharing.isAvailableAsync();
      if (canShareFile) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/jpeg",
          dialogTitle: `Share ${equipment.name}`,
          UTI: "public.jpeg",
        });
        return;
      }
    } catch (err) {
      console.warn("[share] preview capture failed:", err);
    }

    try {
      await Share.share({ title: equipment.name, message });
    } catch {
      Alert.alert(t("equipment.could_not_share"), t("equipment.share_try_again"));
    }
  };

  const handleAddToTodaysWorkout = () => {
    router.push({
      pathname: "/workout-session",
      params: { exercise: name, muscles: (equipment.muscle_groups || []).join(",") },
    });
  };

  const calcWeight = (): string => {
    const bw = parseFloat(bodyWeight);
    if (!bw || !weightFactor) return "—";
    const multiplier = LEVEL_MULTIPLIERS[level];
    const result = bw * weightFactor * multiplier;
    return `${Math.round(result)} ${useLbs ? "lbs" : "kg"}`;
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={coachColors.coral} size="large" />
      </View>
    );
  }

  if (!equipment) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorEmoji}>⚠️</Text>
        <Text style={styles.errorText}>{t("equipment.could_not_load_equipment")}</Text>
        {fetchError && (
          <Text style={styles.errorDetail}>{fetchError}</Text>
        )}
        <View style={styles.errorActions}>
          <TouchableOpacity onPress={fetchEquipment} style={styles.backButton}>
            <Text style={styles.backText}>{t("equipment.retry")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOutline}>
            <Text style={styles.backButtonOutlineText}>{t("equipment.go_back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const name = isEs && equipment.name_es ? equipment.name_es : equipment.name;
  const description = isEs && equipment.description_es ? equipment.description_es : equipment.description;
  const difficultyColor = DIFFICULTY_COLORS[equipment.difficulty] || coachColors.textSecondary;
  const saved = equipment.id ? savedIds.includes(equipment.id) : false;

  const tutorials = equipment.tutorial_steps || [];
  const safetyTips = (isEs ? equipment.safety_tips_es : equipment.safety_tips) || [];

  const TAB_LABELS: Record<TabType, string> = {
    tutorial: t("equipment.tutorial"),
    safety: t("equipment.safety_short"),
    videos: t("equipment.videos"),
    workout: t("equipment.workout"),
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {/* Navy hero — muscle diagram with back/save overlaid, per the mockup */}
      <View style={styles.hero}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.heroBackBtn, { top: insets.top + spacing.sm }]}
        >
          <Ionicons name="chevron-back" size={20} color={coachColors.card} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.heroSaveBtn, { top: insets.top + spacing.sm }]}
          accessibilityRole="button"
        >
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={coachColors.card} />
        </TouchableOpacity>
        <MuscleMapView muscleGroups={equipment.muscle_groups || []} category={equipment.category} />
      </View>

      <ScrollView style={styles.sheet} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
              <Ionicons name="share-outline" size={20} color={coachColors.textSecondary} />
            </TouchableOpacity>
          </View>

          {equipment.confidence && (
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>
                {t("equipment.identified_as")} · {Math.round(equipment.confidence * 100)}% {t("equipment.confidence")}
              </Text>
            </View>
          )}

          <Text style={styles.name}>{name}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.metaRow}>
            {equipment.category && (
              <View style={styles.categoryTag}>
                <Text style={styles.categoryText}>
                  {t(`equipment.categories.${equipment.category}`)}
                </Text>
              </View>
            )}
            {equipment.difficulty && (
              <View style={[styles.difficultyTag, { borderColor: difficultyColor }]}>
                <Text style={[styles.difficultyText, { color: difficultyColor }]}>
                  {t(`equipment.${equipment.difficulty}`)}
                </Text>
              </View>
            )}
          </View>

          {equipment.muscle_groups?.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("equipment.muscle_groups")}</Text>
              <MuscleGroupTags groups={equipment.muscle_groups} />
            </View>
          )}

          {/* Tab bar */}
          <View style={styles.tabBarWrap}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, activeTab === tab && styles.tabTextActive]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {TAB_LABELS[tab]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tutorial tab */}
          {activeTab === "tutorial" && (
            <View style={styles.tabContent}>
              {tutorials.length === 0 ? (
                <Text style={styles.noVideos}>{t("equipment.tutorial_empty")}</Text>
              ) : tutorials.map((step: any, index: number) => (
                <TouchableOpacity
                  key={step.step || index}
                  onPress={() => setExpandedStep(expandedStep === index ? null : index)}
                  style={styles.stepCard}
                  activeOpacity={0.8}
                >
                  <View style={styles.stepHeader}>
                    <Text style={styles.stepNumberText}>{String(step.step || index + 1).padStart(2, "0")}</Text>
                    <Text style={styles.stepInstruction} numberOfLines={expandedStep === index ? undefined : 2}>
                      {isEs && step.instruction_es ? step.instruction_es : step.instruction}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Safety tab */}
          {activeTab === "safety" && (
            <View style={styles.tabContent}>
              {safetyTips.length === 0 ? (
                <Text style={styles.noVideos}>{t("equipment.safety_empty")}</Text>
              ) : safetyTips.map((tip: string, index: number) => (
                <View key={index} style={styles.safetyItem}>
                  <Text style={styles.safetyIcon}>⚠️</Text>
                  <Text style={styles.safetyText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Videos tab */}
          {activeTab === "videos" && (
            <View style={styles.tabContent}>
              {videosLoading ? (
                <View style={styles.videosLoading}>
                  <ActivityIndicator color={coachColors.coral} />
                  <Text style={styles.videosLoadingText}>{t("equipment.videos_loading")}</Text>
                </View>
              ) : videos.length === 0 && videosFetched ? (
                <View style={styles.videosEmpty}>
                  <Text style={styles.noVideos}>{t("equipment.videos_empty")}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setVideosFetched(false);
                      fetchVideos(equipment.id, equipment.name);
                    }}
                    style={styles.retryVideos}
                  >
                    <Text style={styles.retryVideosText}>{t("equipment.retry")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                videos.map((video: any) => (
                  <TouchableOpacity
                    key={video.youtube_id}
                    onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${video.youtube_id}`)}
                    style={styles.videoCard}
                    activeOpacity={0.85}
                  >
                    {video.thumbnail_url ? (
                      <Image source={{ uri: video.thumbnail_url }} style={styles.videoThumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.videoThumbPlaceholder}>
                        <Text style={{ fontSize: 24 }}>▶</Text>
                      </View>
                    )}
                    <View style={styles.videoInfo}>
                      {video.curator_approved && (
                        <View style={styles.curatedBadge}>
                          <Text style={styles.curatedText}>✓ Curated</Text>
                        </View>
                      )}
                      <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
                      {video.duration && (
                        <Text style={styles.videoDuration}>{video.duration}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Workout tab */}
          {activeTab === "workout" && (
            <View style={styles.tabContent}>
              {weightFactorLoading ? (
                <View style={styles.videosLoading}>
                  <ActivityIndicator color={coachColors.coral} />
                  <Text style={styles.videosLoadingText}>{t("equipment.calculating")}</Text>
                </View>
              ) : (
                <>
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
                          onValueChange={(v) => setUseLbs(!v)}
                          trackColor={{ false: coachColors.coral, true: coachColors.coral }}
                          thumbColor={coachColors.card}
                        />
                        <Text style={[styles.unitText, !useLbs && styles.unitActive]}>kg</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.calcCard}>
                    <Text style={styles.calcLabel}>{t("equipment.experience_level")}</Text>
                    <View style={styles.levelRow}>
                      {(["Beginner", "Intermediate", "Advanced"] as const).map((l) => (
                        <TouchableOpacity
                          key={l}
                          style={[styles.levelBtn, level === l && styles.levelBtnActive]}
                          onPress={() => setLevel(l)}
                        >
                          <Text style={[styles.levelBtnText, level === l && styles.levelBtnTextActive]}>
                          {t(`equipment.${l.toLowerCase()}`)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.resultsCard}>
                    <Text style={styles.resultsTitle}>{t("equipment.your_starting_weight")}</Text>
                    <Text style={styles.resultsWeight}>{bodyWeight ? calcWeight() : t("equipment.enter_weight")}</Text>

                    <View style={styles.resultsDivider} />

                    <View style={styles.resultRow}>
                      <Text style={styles.resultKey}>{t("equipment.sets_reps")}</Text>
                      <Text style={styles.resultVal}>{t(`equipment.sets_reps_by_level.${level}`)}</Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultKey}>{t("equipment.rest_time")}</Text>
                      <Text style={styles.resultVal}>{t(`equipment.rest_by_level.${level}`)}</Text>
                    </View>

                    <View style={styles.tipBox}>
                      <Text style={styles.tipBoxText}>
                        {bodyWeight
                          ? t("equipment.personalized_tip", { name })
                          : t("equipment.add_weight_tip")}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          <View style={styles.askCoachWrap}>
            <AskCoachCard equipmentName={name} />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.safetyRow}>
          <Ionicons name="shield-checkmark-outline" size={18} color={coachColors.amberIcon} />
          <Text style={styles.safetyRowText}>{t("equipment.safety_pain_caution")}</Text>
        </View>
        <TouchableOpacity style={styles.addToWorkoutButton} onPress={handleAddToTodaysWorkout}>
          <Text style={styles.addToWorkoutText}>{t("equipment.add_to_todays_workout")}</Text>
        </TouchableOpacity>
      </View>

      {/* Toast */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          {
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          },
        ]}
      >
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: coachColors.coachNavy },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: coachColors.bg },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorText: { color: coachColors.text, fontSize: 18, fontFamily: coachFonts.bodyBold, marginBottom: 8, textAlign: "center" },
  errorDetail: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body, textAlign: "center", marginBottom: 24, lineHeight: 18 },
  errorActions: { flexDirection: "row", gap: 12 },
  backButton: { backgroundColor: coachColors.coralPressed, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 10 },
  backText: { color: coachColors.card, fontFamily: coachFonts.bodyBold },
  backButtonOutline: { borderWidth: 1, borderColor: coachColors.border, borderRadius: radii.pill, paddingHorizontal: 20, paddingVertical: 10 },
  backButtonOutlineText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold },
  hero: { height: 220, position: "relative", alignItems: "center", justifyContent: "center" },
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
  heroSaveBtn: {
    position: "absolute",
    right: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  sheet: { flex: 1, backgroundColor: coachColors.bg, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet },
  content: { padding: spacing.xl, paddingBottom: 180 },
  headerRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  shareBtn: { padding: 8 },
  confidenceBadge: {
    backgroundColor: coachColors.coral + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: "flex-start", marginBottom: 12,
  },
  confidenceText: { color: coachColors.coral, fontSize: 11, fontFamily: coachFonts.bodySemiBold },
  name: { color: coachColors.text, fontSize: 32, fontFamily: coachFonts.headingExtraBold, marginBottom: 8, lineHeight: 36, letterSpacing: -0.5 },
  description: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body, lineHeight: 22, marginBottom: 16 },
  metaRow: { flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" },
  categoryTag: {
    backgroundColor: coachColors.coral, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6,
  },
  categoryText: { color: coachColors.card, fontSize: 13, fontFamily: coachFonts.bodyExtraBold },
  difficultyTag: { borderRadius: radii.pill, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
  difficultyText: { fontSize: 13, fontFamily: coachFonts.bodySemiBold },
  section: { marginBottom: 20 },
  sectionTitle: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyExtraBold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  tabBarWrap: {
    flexDirection: "row",
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    padding: 4,
    borderWidth: 1,
    borderColor: coachColors.border,
    marginBottom: 20,
    gap: 3,
  },
  tab: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.card - 4,
    paddingHorizontal: 4,
  },
  tabActive: {
    backgroundColor: coachColors.coralPressed,
    ...Platform.select({
      ios: { shadowColor: coachColors.coral, shadowOpacity: 0.25, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
      default: {},
    }),
  },
  tabText: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodySemiBold, textAlign: "center" },
  tabTextActive: { color: coachColors.card },
  tabContent: { gap: 12 },
  stepCard: {
    backgroundColor: coachColors.card, borderRadius: radii.card, padding: spacing.lg,
    borderWidth: 1, borderColor: coachColors.border,
  },
  stepHeader: { flexDirection: "row", alignItems: "baseline", gap: spacing.md },
  stepNumberText: { width: 30, color: coachColors.coral, fontSize: 20, fontFamily: coachFonts.headingExtraBold },
  stepInstruction: { color: coachColors.text, fontSize: 14, fontFamily: coachFonts.body, lineHeight: 22, flex: 1 },
  safetyItem: {
    flexDirection: "row", gap: 12,
    backgroundColor: "#faf1d9", borderRadius: radii.card, padding: spacing.lg,
  },
  safetyIcon: { fontSize: 18, flexShrink: 0 },
  safetyText: { color: coachColors.text, fontSize: 14, fontFamily: coachFonts.body, lineHeight: 22, flex: 1 },
  toast: {
    position: "absolute",
    bottom: 130,
    alignSelf: "center",
    backgroundColor: coachColors.text,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
      default: { boxShadow: "0 4px 8px rgba(0,0,0,0.15)" },
    }),
  },
  toastText: { color: coachColors.card, fontSize: 14, fontFamily: coachFonts.bodySemiBold },
  noVideos: { color: coachColors.textSecondary, fontFamily: coachFonts.body, textAlign: "center", paddingVertical: 16 },
  videosLoading: { alignItems: "center", paddingVertical: 40, gap: 12 },
  videosLoadingText: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body },
  videosEmpty: { alignItems: "center", paddingVertical: 32, gap: 16 },
  retryVideos: { backgroundColor: coachColors.card, borderRadius: 10, borderWidth: 1, borderColor: coachColors.border, paddingHorizontal: 20, paddingVertical: 8 },
  retryVideosText: { color: coachColors.coral, fontSize: 13, fontFamily: coachFonts.bodyBold },
  videoCard: {
    flexDirection: "row", backgroundColor: coachColors.card,
    borderRadius: radii.card, overflow: "hidden",
    borderWidth: 1, borderColor: coachColors.border,
  },
  videoThumb: { width: 120, height: 80 },
  videoThumbPlaceholder: {
    width: 120, height: 80,
    backgroundColor: coachColors.bg, alignItems: "center", justifyContent: "center",
  },
  videoInfo: { flex: 1, padding: 12, justifyContent: "space-between" },
  curatedBadge: {
    backgroundColor: "#eef6e0", borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginBottom: 4,
  },
  curatedText: { color: coachColors.limeText, fontSize: 10, fontFamily: coachFonts.bodyBold },
  videoTitle: { color: coachColors.text, fontSize: 13, fontFamily: coachFonts.body, lineHeight: 18 },
  videoDuration: { color: coachColors.textSecondary, fontSize: 11, fontFamily: coachFonts.body, marginTop: 4 },

  // Workout calculator styles
  calcCard: {
    backgroundColor: coachColors.card, borderRadius: radii.card, padding: spacing.lg,
    borderWidth: 1, borderColor: coachColors.border,
  },
  calcLabel: {
    color: coachColors.textSecondary, fontSize: 11, fontFamily: coachFonts.bodyExtraBold,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
  },
  calcInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  calcInput: {
    flex: 1, backgroundColor: coachColors.bg, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    color: coachColors.text, fontSize: 18, fontFamily: coachFonts.bodyBold,
    borderWidth: 1, borderColor: coachColors.border,
  },
  unitToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  unitText: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.bodySemiBold },
  unitActive: { color: coachColors.coral, fontFamily: coachFonts.bodyBold },
  levelRow: { flexDirection: "row", gap: 8 },
  levelBtn: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    backgroundColor: coachColors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: coachColors.border,
  },
  levelBtnActive: { backgroundColor: coachColors.coralPressed, borderColor: coachColors.coralPressed },
  levelBtnText: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodySemiBold },
  levelBtnTextActive: { color: coachColors.card, fontFamily: coachFonts.bodyBold },
  resultsCard: {
    backgroundColor: coachColors.coral + "0d", borderRadius: radii.card, padding: 20,
    borderWidth: 1, borderColor: coachColors.coral + "30",
  },
  resultsTitle: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyExtraBold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  resultsWeight: { color: coachColors.coral, fontSize: 40, fontFamily: coachFonts.headingExtraBold, marginBottom: 16 },
  resultsDivider: { height: 1, backgroundColor: coachColors.coral + "30", marginBottom: 16 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  resultKey: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body },
  resultVal: { color: coachColors.text, fontSize: 13, fontFamily: coachFonts.bodyBold },
  tipBox: {
    marginTop: 12, backgroundColor: "#eef6e0", borderRadius: 10,
    padding: 12,
  },
  tipBoxText: { color: coachColors.limeText, fontSize: 12, fontFamily: coachFonts.body, lineHeight: 18 },

  askCoachWrap: { marginTop: 20 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: coachColors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  safetyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  safetyRowText: { color: coachColors.amberText, fontSize: 13, fontFamily: coachFonts.body },
  addToWorkoutButton: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  addToWorkoutText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 17 },
});

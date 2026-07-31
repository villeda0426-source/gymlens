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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { captureScreen } from "react-native-view-shot";
import SafeScreen from "@/components/Layout/SafeScreen";
import MuscleGroupTags from "@/components/Equipment/MuscleGroupTags";
import MuscleMapView from "@/components/Equipment/MuscleMapView";
import { useEquipmentStore } from "@/store/equipmentStore";
import { useAuthStore } from "@/store/authStore";
import { colors, fonts } from "@/constants/theme";
import { apiFetch } from "@/lib/api";

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: colors.lime,
  intermediate: "#f59e0b",
  advanced: colors.coral,
};

const TABS = ["tutorial", "safety", "videos", "workout"] as const;
type TabType = typeof TABS[number];

const LEVEL_MULTIPLIERS = { Beginner: 1.0, Intermediate: 1.4, Advanced: 1.8 };
const LEVEL_SETS_REPS = {
  Beginner: "3 sets × 10–12 reps",
  Intermediate: "4 sets × 8–10 reps",
  Advanced: "5 sets × 6–8 reps",
};
const LEVEL_REST = {
  Beginner: "90 sec",
  Intermediate: "75 sec",
  Advanced: "60 sec",
};

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
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
      setFetchError(err.message || "Failed to load equipment");
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
      const params = new URLSearchParams({ name });
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
    if (result === "saved") showToast("Saved!");
    else if (result === "removed") showToast("Removed from saved");
    else showToast("Could not save — try again");
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
      Alert.alert("Could not share", "Try again in a moment.");
    }
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
      <SafeScreen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.coral} size="large" />
        </View>
      </SafeScreen>
    );
  }

  if (!equipment) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>Could not load equipment</Text>
          {fetchError && (
            <Text style={styles.errorDetail}>{fetchError}</Text>
          )}
          <View style={styles.errorActions}>
            <TouchableOpacity onPress={fetchEquipment} style={styles.backButton}>
              <Text style={styles.backText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButtonOutline}>
              <Text style={styles.backButtonOutlineText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeScreen>
    );
  }

  const name = isEs && equipment.name_es ? equipment.name_es : equipment.name;
  const description = isEs && equipment.description_es ? equipment.description_es : equipment.description;
  const difficultyColor = DIFFICULTY_COLORS[equipment.difficulty] || "#888888";
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
    <SafeScreen edges={["top"]} style={{ flex: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleSave} style={[styles.actionBtn, saved && styles.actionBtnSaved]}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={21}
              color={saved ? colors.coral : colors.textMuted}
            />
            <Text style={[styles.actionLabel, saved && styles.actionLabelSaved]}>
              {saved ? "Saved" : "Save"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.actionBtn}>
            <Ionicons name="share-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero — muscle diagram */}
        <View style={styles.heroMuscle}>
          <MuscleMapView
            muscleGroups={equipment.muscle_groups || []}
            category={equipment.category}
          />
        </View>

        <View style={styles.content}>
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
                <Text style={styles.noVideos}>No tutorial steps available</Text>
              ) : tutorials.map((step: any, index: number) => (
                <TouchableOpacity
                  key={step.step || index}
                  onPress={() => setExpandedStep(expandedStep === index ? null : index)}
                  style={styles.stepCard}
                  activeOpacity={0.8}
                >
                  <View style={styles.stepHeader}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{step.step || index + 1}</Text>
                    </View>
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
                <Text style={styles.noVideos}>No safety tips available</Text>
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
                  <ActivityIndicator color={colors.coral} />
                  <Text style={styles.videosLoadingText}>Finding tutorial videos…</Text>
                </View>
              ) : videos.length === 0 && videosFetched ? (
                <View style={styles.videosEmpty}>
                  <Text style={styles.noVideos}>No videos found</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setVideosFetched(false);
                      fetchVideos(equipment.id, equipment.name);
                    }}
                    style={styles.retryVideos}
                  >
                    <Text style={styles.retryVideosText}>Retry</Text>
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
                  <ActivityIndicator color={colors.coral} />
                  <Text style={styles.videosLoadingText}>Calculating recommendations…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.calcCard}>
                    <Text style={styles.calcLabel}>Body Weight</Text>
                    <View style={styles.calcInputRow}>
                      <TextInput
                        style={styles.calcInput}
                        placeholder="e.g. 160"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={bodyWeight}
                        onChangeText={setBodyWeight}
                      />
                      <View style={styles.unitToggle}>
                        <Text style={[styles.unitText, useLbs && styles.unitActive]}>lbs</Text>
                        <Switch
                          value={!useLbs}
                          onValueChange={(v) => setUseLbs(!v)}
                          trackColor={{ false: colors.coral, true: colors.coral }}
                          thumbColor={colors.white}
                        />
                        <Text style={[styles.unitText, !useLbs && styles.unitActive]}>kg</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.calcCard}>
                    <Text style={styles.calcLabel}>Experience Level</Text>
                    <View style={styles.levelRow}>
                      {(["Beginner", "Intermediate", "Advanced"] as const).map((l) => (
                        <TouchableOpacity
                          key={l}
                          style={[styles.levelBtn, level === l && styles.levelBtnActive]}
                          onPress={() => setLevel(l)}
                        >
                          <Text style={[styles.levelBtnText, level === l && styles.levelBtnTextActive]}>
                            {l}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.resultsCard}>
                    <Text style={styles.resultsTitle}>Your Starting Weight</Text>
                    <Text style={styles.resultsWeight}>{bodyWeight ? calcWeight() : "Enter weight"}</Text>

                    <View style={styles.resultsDivider} />

                    <View style={styles.resultRow}>
                      <Text style={styles.resultKey}>Sets & Reps</Text>
                      <Text style={styles.resultVal}>{LEVEL_SETS_REPS[level]}</Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultKey}>Rest Time</Text>
                      <Text style={styles.resultVal}>{LEVEL_REST[level]}</Text>
                    </View>

                    <View style={styles.tipBox}>
                      <Text style={styles.tipBoxText}>
                        {bodyWeight
                          ? `Personalized for ${name} based on your body weight`
                          : "Add your body weight above and this updates instantly."}
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>

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
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  errorEmoji: { fontSize: 48, marginBottom: 16 },
  errorText: { color: colors.text, fontSize: 18, fontFamily: fonts.bold, marginBottom: 8, textAlign: "center" },
  errorDetail: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body, textAlign: "center", marginBottom: 24, lineHeight: 18 },
  errorActions: { flexDirection: "row", gap: 12 },
  backButton: { backgroundColor: colors.coral, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  backText: { color: colors.white, fontFamily: fonts.bold },
  backButtonOutline: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  backButtonOutlineText: { color: colors.textSecondary, fontFamily: fonts.bold },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { padding: 8 },
  backIcon: { color: colors.text, fontSize: 32, fontWeight: "300", lineHeight: 32 },
  headerActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    padding: 8, borderRadius: 10, flexDirection: "row", alignItems: "center", gap: 4,
  },
  actionBtnSaved: { backgroundColor: colors.coral + "18", borderWidth: 1, borderColor: colors.coral + "40" },
  actionLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semiBold },
  actionLabelSaved: { color: colors.coral },
  heroMuscle: {
    backgroundColor: colors.bg,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  content: { padding: 20 },
  confidenceBadge: {
    backgroundColor: colors.coral + "18", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: "flex-start", marginBottom: 12,
  },
  confidenceText: { color: colors.coral, fontSize: 11, fontFamily: fonts.semiBold },
  name: { color: colors.text, fontSize: 28, fontFamily: fonts.heading, marginBottom: 8, lineHeight: 34 },
  description: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body, lineHeight: 22, marginBottom: 16 },
  metaRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  categoryTag: {
    backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  categoryText: { color: colors.text, fontSize: 12, fontFamily: fonts.semiBold, textTransform: "uppercase" },
  difficultyTag: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  difficultyText: { fontSize: 12, fontFamily: fonts.bold, textTransform: "uppercase" },
  section: { marginBottom: 20 },
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  tabBarWrap: {
    flexDirection: "row",
    backgroundColor: colors.input,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 20,
    gap: 3,
  },
  tab: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  tabActive: {
    backgroundColor: colors.coral,
    shadowColor: colors.coral,
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tabText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semiBold, textAlign: "center" },
  tabTextActive: { color: colors.white },
  tabContent: { gap: 12 },
  stepCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  stepHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  stepNumber: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.coral, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepNumberText: { color: colors.white, fontSize: 14, fontFamily: fonts.extraBold },
  stepInstruction: { color: colors.text, fontSize: 14, fontFamily: fonts.body, lineHeight: 22, flex: 1 },
  safetyItem: {
    flexDirection: "row", gap: 12,
    backgroundColor: colors.coral + "0f", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.coral + "30",
  },
  safetyIcon: { fontSize: 18, flexShrink: 0 },
  safetyText: { color: colors.text, fontSize: 14, fontFamily: fonts.body, lineHeight: 22, flex: 1 },
  toast: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    backgroundColor: colors.text,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  toastText: { color: colors.white, fontSize: 14, fontFamily: fonts.semiBold },
  noVideos: { color: colors.textMuted, fontFamily: fonts.body, textAlign: "center", paddingVertical: 16 },
  videosLoading: { alignItems: "center", paddingVertical: 40, gap: 12 },
  videosLoadingText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
  videosEmpty: { alignItems: "center", paddingVertical: 32, gap: 16 },
  retryVideos: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 20, paddingVertical: 8 },
  retryVideosText: { color: colors.coral, fontSize: 13, fontFamily: fonts.bold },
  videoCard: {
    flexDirection: "row", backgroundColor: colors.card,
    borderRadius: 12, overflow: "hidden",
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  videoThumb: { width: 120, height: 80 },
  videoThumbPlaceholder: {
    width: 120, height: 80,
    backgroundColor: colors.input, alignItems: "center", justifyContent: "center",
  },
  videoInfo: { flex: 1, padding: 12, justifyContent: "space-between" },
  curatedBadge: {
    backgroundColor: colors.lime + "18", borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginBottom: 4,
  },
  curatedText: { color: colors.lime, fontSize: 10, fontFamily: fonts.bold },
  videoTitle: { color: colors.text, fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  videoDuration: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body, marginTop: 4 },

  // Workout calculator styles
  calcCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  calcLabel: {
    color: colors.textMuted, fontSize: 11, fontFamily: fonts.bold,
    textTransform: "uppercase", letterSpacing: 1, marginBottom: 10,
  },
  calcInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  calcInput: {
    flex: 1, backgroundColor: colors.input, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    color: colors.text, fontSize: 18, fontFamily: fonts.bold,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  unitToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  unitText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semiBold },
  unitActive: { color: colors.coral, fontFamily: fonts.bold },
  levelRow: { flexDirection: "row", gap: 8 },
  levelBtn: {
    flex: 1, paddingVertical: 10, alignItems: "center",
    backgroundColor: colors.input, borderRadius: 10,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  levelBtnActive: { backgroundColor: colors.coral, borderColor: colors.coral },
  levelBtnText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semiBold },
  levelBtnTextActive: { color: colors.white, fontFamily: fonts.bold },
  resultsCard: {
    backgroundColor: colors.coral + "0d", borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: colors.coral + "30",
  },
  resultsTitle: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.bold, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  resultsWeight: { color: colors.coral, fontSize: 40, fontFamily: fonts.heading, marginBottom: 16 },
  resultsDivider: { height: 1, backgroundColor: colors.coral + "30", marginBottom: 16 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  resultKey: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body },
  resultVal: { color: colors.text, fontSize: 13, fontFamily: fonts.bold },
  tipBox: {
    marginTop: 12, backgroundColor: colors.lime + "12", borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: colors.lime + "30",
  },
  tipBoxText: { color: colors.lime, fontSize: 12, fontFamily: fonts.body, lineHeight: 18 },
});

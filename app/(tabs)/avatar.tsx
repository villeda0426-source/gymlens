import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import DetailTabBar from "@/components/Equipment/DetailTabBar";
import AvatarBody, { AvatarBodyStyle, AvatarView } from "@/components/Avatar/AvatarBody";
import MuscleDetailModal from "@/components/Avatar/MuscleDetailModal";
import { useAuthStore } from "@/store/authStore";
import { useMuscleProgressStore, CompletedExerciseRow } from "@/store/muscleProgressStore";
import { AvatarMuscleGroup, getUndertrainedRecommendation } from "@/lib/muscleProgress";
import { colors, fonts } from "@/constants/theme";

const AVATAR_BODY_STYLE_KEY = "spotlift_avatar_body_style";

export default function AvatarScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { progress, loadProgress, recentCompletionsFor } = useMuscleProgressStore();

  const [view, setView] = useState<AvatarView>("front");
  const [bodyStyle, setBodyStyle] = useState<AvatarBodyStyle>("straight");
  const [selectedGroup, setSelectedGroup] = useState<AvatarMuscleGroup | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [recentCompletions, setRecentCompletions] = useState<CompletedExerciseRow[]>([]);
  const [totalCompletions, setTotalCompletions] = useState(0);

  useEffect(() => {
    loadProgress(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    AsyncStorage.getItem(AVATAR_BODY_STYLE_KEY).then((savedStyle) => {
      if (savedStyle === "straight" || savedStyle === "curved") {
        setBodyStyle(savedStyle);
      }
    });
  }, []);

  const selectBodyStyle = (nextStyle: AvatarBodyStyle) => {
    setBodyStyle(nextStyle);
    AsyncStorage.setItem(AVATAR_BODY_STYLE_KEY, nextStyle);
  };

  const levels = useMemo(() => {
    const map = {} as Record<AvatarMuscleGroup, number>;
    for (const group of Object.keys(progress) as AvatarMuscleGroup[]) {
      map[group] = progress[group].level;
    }
    return map;
  }, [progress]);

  const recommendation = useMemo(() => getUndertrainedRecommendation(progress), [progress]);

  const handlePressMuscle = async (group: AvatarMuscleGroup) => {
    setSelectedGroup(group);
    setModalVisible(true);

    if (!user?.id) {
      setRecentCompletions([]);
      setTotalCompletions(0);
      return;
    }

    setLoadingDetail(true);
    try {
      const { rows, total } = await recentCompletionsFor(user.id, group);
      setRecentCompletions(rows);
      setTotalCompletions(total);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <SafeScreen edges={["top"]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("avatar_progress.title")}</Text>
        <Text style={styles.subtitle}>{t("avatar_progress.subtitle")}</Text>
      </View>

      <View style={styles.toggleWrap}>
        <DetailTabBar
          tabs={[
            { key: "front", label: t("avatar_progress.front") },
            { key: "side", label: t("avatar_progress.side") },
            { key: "back", label: t("avatar_progress.back") },
          ]}
          activeTab={view}
          onChange={(key) => setView(key as AvatarView)}
        />
      </View>

      <View style={styles.styleRow}>
        <Text style={styles.styleLabel}>{t("avatar_progress.body_style")}</Text>
        <View style={styles.styleOptions}>
          {(["straight", "curved"] as AvatarBodyStyle[]).map((option) => (
            <TouchableOpacity
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: bodyStyle === option }}
              onPress={() => selectBodyStyle(option)}
              style={[styles.styleButton, bodyStyle === option && styles.styleButtonActive]}
            >
              <Text style={[styles.styleButtonText, bodyStyle === option && styles.styleButtonTextActive]}>
                {t(`avatar_progress.${option}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.avatarWrap}>
        <AvatarBody
          view={view}
          onChangeView={setView}
          bodyStyle={bodyStyle}
          levels={levels}
          onPressMuscle={handlePressMuscle}
        />
        <Text style={styles.rotateHint}>{t("avatar_progress.rotate_hint")}</Text>
      </View>

      {!user && (
        <View style={styles.guestBanner}>
          <Text style={styles.guestBannerText}>{t("avatar_progress.guest_banner")}</Text>
        </View>
      )}

      <MuscleDetailModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        muscleGroup={selectedGroup}
        score={selectedGroup ? progress[selectedGroup]?.score ?? 0 : 0}
        level={selectedGroup ? progress[selectedGroup]?.level ?? 0 : 0}
        totalCompletions={totalCompletions}
        recentCompletions={recentCompletions}
        loading={loadingDetail}
        recommendation={recommendation}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  title: { fontSize: 28, fontFamily: fonts.heading, color: colors.text },
  subtitle: { fontSize: 13, fontFamily: fonts.body, color: colors.textSecondary, marginTop: 4 },
  toggleWrap: { paddingHorizontal: 20, paddingTop: 16 },
  styleRow: {
    paddingHorizontal: 20, paddingTop: 12, flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
  },
  styleLabel: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semiBold },
  styleOptions: {
    flexDirection: "row", padding: 3, borderRadius: 12, backgroundColor: colors.input,
  },
  styleButton: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9 },
  styleButtonActive: { backgroundColor: colors.card },
  styleButtonText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.bold },
  styleButtonTextActive: { color: colors.coral },
  avatarWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  rotateHint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 10 },
  guestBanner: {
    marginHorizontal: 20, marginBottom: 20, backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.cardBorder, padding: 14,
  },
  guestBannerText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.body, textAlign: "center" },
});

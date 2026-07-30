import React from "react";
import { View, Text, Image, TouchableOpacity, Linking, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";

export interface VideoItem {
  youtube_id: string;
  title: string;
  thumbnail_url?: string;
  duration?: string;
  curator_approved?: boolean;
}

interface VideoListProps {
  videos: VideoItem[];
  loading: boolean;
  fetched: boolean;
  onRetry?: () => void;
  loadingLabel?: string;
  emptyLabel?: string;
}

export default function VideoList({
  videos,
  loading,
  fetched,
  onRetry,
  loadingLabel,
  emptyLabel,
}: VideoListProps) {
  const { t } = useTranslation();
  const resolvedLoadingLabel = loadingLabel ?? t("equipment.videos_loading");
  const resolvedEmptyLabel = emptyLabel ?? t("equipment.videos_empty");

  if (loading) {
    return (
      <View style={styles.videosLoading}>
        <ActivityIndicator color={colors.coral} />
        <Text style={styles.videosLoadingText}>{resolvedLoadingLabel}</Text>
      </View>
    );
  }

  if (videos.length === 0 && fetched) {
    return (
      <View style={styles.videosEmpty}>
        <Text style={styles.noVideos}>{resolvedEmptyLabel}</Text>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryVideos}>
            <Text style={styles.retryVideosText}>{t("equipment.retry")}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videos.map((video) => (
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
                <Text style={styles.curatedText}>✓ {t("equipment.curated")}</Text>
              </View>
            )}
            <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
            {video.duration && (
              <Text style={styles.videoDuration}>{video.duration}</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
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
});

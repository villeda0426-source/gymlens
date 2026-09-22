import React from "react";
import { View, Image, TouchableOpacity, Text, StyleSheet, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface ImagePreviewProps {
  uri: string;
  onIdentify: () => void;
  onRetake: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function ImagePreview({ uri, onIdentify, onRetake, isLoading, error }: ImagePreviewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      <View style={styles.overlay} />
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity onPress={onRetake} style={styles.retakeButton} disabled={isLoading}>
          <Text style={styles.retakeText}>{t("camera.retake")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onIdentify}
          style={[styles.identifyButton, isLoading && styles.identifyButtonDisabled]}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <Text style={styles.identifyText}>
            {isLoading ? "..." : t("camera.identify")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  image: { width, height: height * 0.75 },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.35,
    backgroundColor: "rgba(10, 10, 10, 0.72)",
  },
  actions: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  errorBanner: {
    position: "absolute",
    top: 24,
    left: 16,
    right: 16,
    backgroundColor: "#FF4747CC",
    borderRadius: 12,
    padding: 14,
  },
  errorText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 18,
  },
  retakeButton: {
    borderWidth: 1,
    borderColor: "#F5F5F5",
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  retakeText: { color: "#F5F5F5", fontSize: 16, fontWeight: "600" },
  identifyButton: {
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  identifyButtonDisabled: { opacity: 0.5 },
  identifyText: { color: colors.white, fontSize: 16, fontFamily: fonts.extraBold },
});

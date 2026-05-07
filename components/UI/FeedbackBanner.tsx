import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

interface FeedbackBannerProps {
  identificationId?: string;
}

export default function FeedbackBanner({ identificationId }: FeedbackBannerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t("profile.feedback")}?</Text>
      <TouchableOpacity
        onPress={() =>
          router.push({ pathname: "/feedback", params: { identificationId } })
        }
        style={styles.cta}
      >
        <Text style={styles.ctaText}>⭐ Rate</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setDismissed(true)} style={styles.dismiss}>
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderTopWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  text: { color: "#F5F5F5", flex: 1, fontSize: 13 },
  cta: {
    backgroundColor: "#E8FF47",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaText: { color: "#0A0A0A", fontSize: 12, fontWeight: "700" },
  dismiss: { padding: 4 },
  dismissText: { color: "#888888", fontSize: 16 },
});

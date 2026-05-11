import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { colors, fonts } from "@/constants/theme";

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
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  text: { color: colors.text, flex: 1, fontSize: 13, fontFamily: fonts.body },
  cta: {
    backgroundColor: colors.coral,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaText: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },
  dismiss: { padding: 4 },
  dismissText: { color: colors.textMuted, fontSize: 16 },
});

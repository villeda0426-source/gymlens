import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { coachColors, coachFonts } from "@/constants/theme";

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
    backgroundColor: coachColors.card,
    borderTopWidth: 1,
    borderColor: coachColors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  text: { color: coachColors.text, flex: 1, fontSize: 13, fontFamily: coachFonts.body },
  cta: {
    backgroundColor: coachColors.coral,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaText: { color: coachColors.card, fontSize: 12, fontFamily: coachFonts.bodyBold },
  dismiss: { padding: 4 },
  dismissText: { color: coachColors.textSecondary, fontSize: 16 },
});

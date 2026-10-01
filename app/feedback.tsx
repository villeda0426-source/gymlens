import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import SafeScreen from "@/components/Layout/SafeScreen";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { coachColors, coachFonts } from "@/constants/theme";

const CATEGORIES = ["wrong_id", "missing_info", "video_quality", "other"] as const;

export default function FeedbackScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { identificationId } = useLocalSearchParams<{ identificationId?: string }>();
  const { user } = useAuthStore();

  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<string>("other");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const checkScale = useRef(new Animated.Value(0)).current;

  const animateSuccess = () => {
    Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, bounciness: 15 }).start();
  };

  const handleSubmit = async () => {
    if (rating === 0) return;
    setLoading(true);
    try {
      await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.id || null,
          identificationId: identificationId || null,
          rating,
          category,
          message: message.trim() || null,
        }),
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      animateSuccess();
    } catch (error) {
      console.error("[feedback] submit failed:", error);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SafeScreen>
        <View style={styles.success}>
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
            <Text style={styles.checkIcon}>✓</Text>
          </Animated.View>
          <Text style={styles.thankYouTitle}>{t("feedback.thank_you")}</Text>
          <Text style={styles.thankYouMessage}>{t("feedback.thank_you_message")}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.doneButton}>
            <Text style={styles.doneText}>{t("common.done")}</Text>
          </TouchableOpacity>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.closeIcon}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t("feedback.title")}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{t("feedback.subtitle")}</Text>

        <Text style={styles.fieldLabel}>{t("feedback.rating_label")}</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity
              key={star}
              onPress={() => {
                setRating(star);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.star, rating >= star && styles.starActive]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>{t("feedback.category_label")}</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
            >
              <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                {t(`feedback.categories.${cat}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>{t("feedback.message_label")}</Text>
        <TextInput
          style={styles.textarea}
          placeholder={t("feedback.message_placeholder")}
          placeholderTextColor={coachColors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <TouchableOpacity
          onPress={handleSubmit}
          style={[styles.submitButton, (rating === 0 || loading) && styles.submitDisabled]}
          disabled={rating === 0 || loading}
        >
          {loading ? (
            <ActivityIndicator color={coachColors.card} />
          ) : (
            <Text style={styles.submitText}>{t("feedback.submit")}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
  },
  closeIcon: { color: coachColors.textSecondary, fontSize: 18, padding: 4 },
  title: { color: coachColors.text, fontSize: 18, fontFamily: coachFonts.bodyBold },
  form: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  subtitle: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body },
  fieldLabel: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyBold, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: -8 },
  stars: { flexDirection: "row", gap: 12 },
  star: { fontSize: 40, color: coachColors.border },
  starActive: { color: coachColors.coral },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryChip: {
    backgroundColor: coachColors.card, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: coachColors.border,
  },
  categoryChipActive: { backgroundColor: coachColors.coral + "18", borderColor: coachColors.coral },
  categoryChipText: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.bodySemiBold },
  categoryChipTextActive: { color: coachColors.coral },
  textarea: {
    backgroundColor: coachColors.card, borderRadius: 12, padding: 16,
    color: coachColors.text, fontSize: 14, fontFamily: coachFonts.body, minHeight: 100,
    borderWidth: 1, borderColor: coachColors.border, lineHeight: 20,
  },
  submitButton: {
    backgroundColor: coachColors.coral, borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: coachColors.card, fontSize: 16, fontFamily: coachFonts.bodyExtraBold },
  success: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: coachColors.lime, alignItems: "center", justifyContent: "center", marginBottom: 28,
  },
  checkIcon: { color: coachColors.card, fontSize: 48, fontFamily: coachFonts.bodyExtraBold },
  thankYouTitle: { color: coachColors.text, fontSize: 28, fontFamily: coachFonts.heading, marginBottom: 12 },
  thankYouMessage: { color: coachColors.textSecondary, fontSize: 15, fontFamily: coachFonts.body, textAlign: "center", lineHeight: 22, marginBottom: 40 },
  doneButton: {
    backgroundColor: coachColors.coral, borderRadius: 14,
    paddingHorizontal: 48, paddingVertical: 16,
  },
  doneText: { color: coachColors.card, fontSize: 16, fontFamily: coachFonts.bodyExtraBold },
});

// Account deletion confirmation — only reachable from Account Settings.
// Spells out what goes, then needs the confirmation word typed before the
// button even enables, so it can't happen from a stray tap or two.
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";

const LOST_ITEMS = ["profile", "plans", "workouts", "scans"] as const;

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { deleteAccount } = useAuthStore();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Localized ("DELETE" / "ELIMINAR"), compared case-insensitively.
  const word = t("delete_account.confirm_word");
  const confirmed = confirmation.trim().toUpperCase() === word.toUpperCase();

  const handleDelete = async () => {
    if (!confirmed || deleting) return;
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (result.error) {
      Alert.alert(t("profile.delete_account_error"), result.error);
      return;
    }
    if (router.canDismiss()) router.dismissAll();
    router.replace("/(tabs)");
  };

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("plan_setup.back")}
          disabled={deleting}
        >
          <Ionicons name="chevron-back" size={22} color={coachColors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.warningIcon}>
          <Ionicons name="warning-outline" size={26} color={coachColors.coralPressed} />
        </View>
        <Text style={styles.title}>{t("delete_account.title")}</Text>
        <Text style={styles.body}>{t("delete_account.intro")}</Text>

        <View style={styles.lostCard}>
          {LOST_ITEMS.map((item) => (
            <View key={item} style={styles.lostRow}>
              <Ionicons name="close-circle" size={18} color={coachColors.coralPressed} />
              <Text style={styles.lostText}>{t(`delete_account.lost.${item}`)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.body}>{t("delete_account.permanent")}</Text>

        <Text style={styles.inputLabel}>{t("delete_account.type_to_confirm", { word })}</Text>
        <TextInput
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder={word}
          placeholderTextColor={coachColors.border}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          style={styles.input}
          editable={!deleting}
          accessibilityLabel={t("delete_account.type_to_confirm", { word })}
        />

        <TouchableOpacity
          style={[styles.deleteButton, (!confirmed || deleting) && styles.deleteButtonDisabled]}
          onPress={handleDelete}
          disabled={!confirmed || deleting}
          accessibilityRole="button"
          accessibilityState={{ disabled: !confirmed || deleting }}
        >
          {deleting ? (
            <ActivityIndicator color={coachColors.card} />
          ) : (
            <Text style={styles.deleteButtonText}>{t("profile.delete_account_action")}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={deleting} accessibilityRole="button">
          <Text style={styles.cancelText}>{t("delete_account.keep")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: coachColors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 48, gap: spacing.md },
  warningIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coral + "14",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  title: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 28, lineHeight: 33 },
  body: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 22 },
  lostCard: {
    backgroundColor: coachColors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: coachColors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  lostRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  lostText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 14, lineHeight: 20 },
  inputLabel: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 14, marginTop: spacing.sm },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    paddingHorizontal: 14,
    fontFamily: coachFonts.bodyBold,
    fontSize: 16,
    letterSpacing: 2,
    color: coachColors.text,
  },
  deleteButton: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  deleteButtonDisabled: { opacity: 0.35 },
  deleteButtonText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
  cancelButton: { alignItems: "center", paddingVertical: 14 },
  cancelText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 15 },
});

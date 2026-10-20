// Account Settings — reached from the You tab's Settings group. The only
// place "Delete account" lives: a quiet destructive row at the very bottom
// that opens the confirmation screen (app/delete-account.tsx), never a
// one-tap action. App Store rules require in-app deletion, so it stays.
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";

export default function AccountSettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, profile } = useAuthStore();

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(i18n.language?.startsWith("es") ? "es-US" : "en-US", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("plan_setup.back")}
        >
          <Ionicons name="chevron-back" size={22} color={coachColors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("account_settings.title")}</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>{t("account_settings.account")}</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="mail-outline" size={19} color={coachColors.coral} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t("account_settings.email")}</Text>
              <Text style={styles.rowValue} numberOfLines={1}>{user?.email ?? "—"}</Text>
            </View>
          </View>
          {memberSince ? (
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.rowIcon}>
                <Ionicons name="calendar-outline" size={19} color={coachColors.coral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t("account_settings.member_since")}</Text>
                <Text style={styles.rowValue}>{memberSince}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <Text style={styles.dataNote}>{t("account_settings.data_note")}</Text>

        {/* Deliberately last and quiet: plain text, no button chrome, and it
            only opens the confirmation screen. */}
        <TouchableOpacity
          style={styles.deleteRow}
          onPress={() => router.push("/delete-account")}
          accessibilityRole="button"
          accessibilityHint={t("account_settings.delete_hint")}
        >
          <Text style={styles.deleteText}>{t("profile.delete_account")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: coachColors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
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
  backButtonSpacer: { width: 40 },
  headerTitle: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 18 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 48 },
  sectionLabel: {
    color: coachColors.textSecondary,
    fontSize: 12,
    fontFamily: coachFonts.bodyExtraBold,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginHorizontal: 4,
    marginBottom: 8,
    marginTop: spacing.lg,
  },
  section: {
    backgroundColor: coachColors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: coachColors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: coachColors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: coachColors.bg,
  },
  rowLabel: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyBold },
  rowValue: { color: coachColors.text, fontSize: 15, fontFamily: coachFonts.bodySemiBold, marginTop: 2 },
  dataNote: {
    color: coachColors.textSecondary,
    fontSize: 13,
    fontFamily: coachFonts.body,
    lineHeight: 19,
    marginTop: spacing.xl,
    marginHorizontal: 4,
  },
  deleteRow: { alignItems: "center", justifyContent: "center", paddingVertical: 16, marginTop: 56 },
  deleteText: { color: coachColors.coralPressed, fontSize: 13, fontFamily: coachFonts.bodySemiBold },
});

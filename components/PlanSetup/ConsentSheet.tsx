// Health-data consent bottom sheet (Phase 1 decision 4): shown once, the
// first time the person selects any limitation chip other than "Nothing".
// No implicit grant — Allow writes user_consents(health_data); Not now
// proceeds without ever storing the specifics.
import React from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";

const PRIVACY_POLICY_URL = "https://spotlift.app/privacy";

interface ConsentSheetProps {
  visible: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}

export default function ConsentSheet({ visible, onAllow, onNotNow }: ConsentSheetProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onNotNow}>
      <Pressable style={styles.backdrop} onPress={onNotNow} accessibilityLabel={t("plan_setup.consent.dismiss")} />
      <View style={styles.sheet}>
        <Text style={styles.title}>{t("plan_setup.consent.title")}</Text>
        <Text style={styles.body}>{t("plan_setup.consent.body")}</Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => undefined)}>
          <Text style={styles.link}>{t("plan_setup.consent.privacy_policy")}</Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable style={styles.allowButton} onPress={onAllow} accessibilityRole="button" accessibilityLabel={t("plan_setup.consent.allow")}>
            <Text style={styles.allowText}>{t("plan_setup.consent.allow")}</Text>
          </Pressable>
          <Pressable style={styles.notNowButton} onPress={onNotNow} accessibilityRole="button" accessibilityLabel={t("plan_setup.consent.not_now")}>
            <Text style={styles.notNowText}>{t("plan_setup.consent.not_now")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(12,35,64,0.4)" },
  sheet: {
    backgroundColor: coachColors.card,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.xl,
    paddingBottom: 34,
    gap: spacing.md,
  },
  title: { fontFamily: coachFonts.heading, fontSize: 20, color: coachColors.text },
  body: { fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21, color: coachColors.textSecondary },
  link: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.coralPressed, textDecorationLine: "underline" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  allowButton: {
    flex: 1,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  allowText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 15 },
  notNowButton: {
    flex: 1,
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  notNowText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 15 },
});

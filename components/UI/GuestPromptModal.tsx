import React from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";

interface GuestPromptModalProps {
  visible: boolean;
  onClose: () => void;
  onSignUp: () => void;
}

export default function GuestPromptModal({ visible, onClose, onSignUp }: GuestPromptModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("auth.signup_prompt_title")}</Text>
          <Text style={styles.message}>{t("auth.signup_prompt_message")}</Text>
          <TouchableOpacity onPress={onSignUp} style={styles.cta}>
            <Text style={styles.ctaText}>{t("auth.signup_prompt_cta")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.later}>
            <Text style={styles.laterText}>{t("auth.maybe_later")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    width: "100%",
  },
  title: { color: colors.text, fontSize: 22, fontFamily: fonts.heading, marginBottom: 12, textAlign: "center" },
  message: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body, lineHeight: 22, textAlign: "center", marginBottom: 24 },
  cta: {
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  ctaText: { color: colors.white, fontSize: 16, fontFamily: fonts.extraBold },
  later: { alignItems: "center", paddingVertical: 8 },
  laterText: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.body },
});

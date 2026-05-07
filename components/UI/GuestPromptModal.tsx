import React from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

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
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#141414",
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    width: "100%",
  },
  title: { color: "#E8FF47", fontSize: 22, fontWeight: "800", marginBottom: 12, textAlign: "center" },
  message: { color: "#888888", fontSize: 14, lineHeight: 22, textAlign: "center", marginBottom: 24 },
  cta: {
    backgroundColor: "#E8FF47",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  ctaText: { color: "#0A0A0A", fontSize: 16, fontWeight: "800" },
  later: { alignItems: "center", paddingVertical: 8 },
  laterText: { color: "#888888", fontSize: 14 },
});

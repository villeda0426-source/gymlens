import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { setStoredLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { colors, fonts } from "@/constants/theme";

export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const { user } = useAuthStore();
  const current = i18n.language;

  const toggle = async () => {
    const next = current === "en" ? "es" : "en";
    await i18n.changeLanguage(next);
    await setStoredLanguage(next);
    if (user) {
      await supabase.from("profiles").update({ language: next }).eq("id", user.id);
    }
  };

  return (
    <TouchableOpacity onPress={toggle} style={styles.button}>
      <Text style={styles.text}>{current === "en" ? "ES" : "EN"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.input,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.coral,
  },
  text: { color: colors.coral, fontSize: 12, fontFamily: fonts.bold, letterSpacing: 1 },
});

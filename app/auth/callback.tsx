import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { coachColors, coachFonts } from "@/constants/theme";

export default function AuthCallbackScreen() {
  const { t } = useTranslation();

  return (
    <SafeScreen>
      <View style={styles.center}>
        <ActivityIndicator color={coachColors.coral} size="large" />
        <Text style={styles.text}>{t("auth.confirming_email")}</Text>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  text: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body, textAlign: "center" },
});

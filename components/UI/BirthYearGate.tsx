// One-time, one-screen birth-year prompt for existing accounts whose
// age_band is still "unknown" (new accounts collect it on the registration
// form instead — see app/(auth)/register.tsx). Lives outside plan-setup on
// purpose: age applies to the whole account, not just the plan wizard.
//
// Sits inside ForceUpdateGate/AuthGate in app/_layout.tsx: it only ever
// blocks a signed-in user with a loaded profile, never the signed-out or
// still-loading states those gates already own.
import React, { PropsWithChildren, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { computeAgeBand, isBelowMinimumAccountAge, isValidBirthYear, MINIMUM_ACCOUNT_AGE } from "@/shared/ageBand";

export default function BirthYearGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { user, profile, isLoading, setProfile, signOut } = useAuthStore();
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const storedBirthYear = typeof profile?.birth_year === "number" ? (profile.birth_year as number) : null;
  const belowMinimumAge = storedBirthYear !== null && isBelowMinimumAccountAge(storedBirthYear);
  const needsBirthYear = !!user && !isLoading && !!profile && profile.age_band === "unknown" && storedBirthYear === null;

  if (!user || isLoading || !profile || (!needsBirthYear && !belowMinimumAge)) {
    return <>{children}</>;
  }

  if (belowMinimumAge) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t("age_gate.blocked_title")}</Text>
        <Text style={styles.body}>{t("age_gate.blocked_body", { age: MINIMUM_ACCOUNT_AGE })}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => signOut()} accessibilityRole="button" accessibilityLabel={t("age_gate.sign_out")}>
          <Text style={styles.secondaryButtonText}>{t("age_gate.sign_out")}</Text>
        </Pressable>
      </View>
    );
  }

  const submit = async () => {
    const year = Number.parseInt(input.trim(), 10);
    if (!isValidBirthYear(year)) {
      setError(t("age_gate.invalid_year"));
      return;
    }

    setSaving(true);
    setError("");
    const ageBand = computeAgeBand(year);
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ birth_year: year, age_band: ageBand })
      .eq("id", user.id);
    setSaving(false);

    if (updateError) {
      setError(t("age_gate.save_error"));
      return;
    }
    setProfile({ ...profile, birth_year: year, age_band: ageBand });
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.title}>{t("age_gate.title")}</Text>
      <Text style={styles.body}>{t("age_gate.body")}</Text>

      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder={t("age_gate.placeholder")}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.input}
        accessibilityLabel={t("age_gate.title")}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, saving && styles.buttonDisabled]}
        onPress={submit}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={t("age_gate.continue")}
      >
        {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{t("age_gate.continue")}</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, backgroundColor: colors.bg, gap: 14 },
  title: { fontFamily: fonts.heading, fontSize: 28, color: colors.text, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: "center", maxWidth: 320 },
  input: {
    width: 160,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    textAlign: "center",
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.text,
    marginTop: 8,
  },
  error: { fontFamily: fonts.semiBold, fontSize: 13, color: colors.danger },
  primaryButton: {
    minWidth: 200,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: colors.white, fontFamily: fonts.extraBold, fontSize: 16 },
  secondaryButton: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 15, textDecorationLine: "underline" },
});

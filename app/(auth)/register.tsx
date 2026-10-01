import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getAuthRedirectUrl } from "@/lib/authRedirect";
import { coachColors, coachFonts } from "@/constants/theme";

function getRegisterErrorAlert(message: string, t: (key: string) => string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email rate limit")) {
    return {
      title: t("auth.email_busy_title"),
      message: t("auth.email_busy_message"),
    };
  }

  return { title: t("common.error"), message };
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email.trim() || !password || !username.trim()) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: username.trim(), full_name: username.trim() },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });
    setLoading(false);
    if (error) {
      const alert = getRegisterErrorAlert(error.message, t);
      Alert.alert(alert.title, alert.message);
    } else {
      Alert.alert(t("auth.check_email_title"), t("auth.check_email_message"));
      router.replace("/(auth)/login");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Text style={styles.logoCoach}>Spot<Text style={styles.logoLift}>lift</Text></Text>
        <Text style={styles.title}>{t("auth.register")}</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.name")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.username_placeholder")}
              placeholderTextColor={coachColors.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.email")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.email_placeholder")}
              placeholderTextColor={coachColors.textSecondary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.password")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.password_placeholder")}
              placeholderTextColor={coachColors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            onPress={handleRegister}
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={coachColors.card} />
            ) : (
              <Text style={styles.buttonText}>{t("auth.sign_up")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t("auth.have_account")} </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.link}>{t("auth.sign_in")}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: coachColors.bg },
  inner: { paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  logoCoach: { color: coachColors.text, fontSize: 40, fontFamily: coachFonts.heading, marginBottom: 8 },
  logoLift: { color: coachColors.coral },
  title: { color: coachColors.text, fontSize: 26, fontFamily: coachFonts.bodyBold, marginBottom: 40 },
  form: { gap: 20 },
  field: { gap: 8 },
  label: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.bodySemiBold, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: coachColors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: coachColors.text, fontSize: 15, fontFamily: coachFonts.body, borderWidth: 1, borderColor: coachColors.border,
  },
  button: {
    backgroundColor: coachColors.coral, borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: coachColors.card, fontSize: 16, fontFamily: coachFonts.bodyExtraBold },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  footerText: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body },
  link: { color: coachColors.coral, fontSize: 14, fontFamily: coachFonts.bodyBold },
  guestButton: { alignItems: "center", marginTop: 16 },
  guestText: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body },
});

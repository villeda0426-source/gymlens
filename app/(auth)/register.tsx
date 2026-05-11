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
import { colors, fonts } from "@/constants/theme";

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
      options: { data: { username: username.trim() } },
    });
    setLoading(false);
    if (error) {
      Alert.alert(t("errors.auth_failed"), error.message);
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Text style={styles.logoCoach}>Coach<Text style={styles.logoLift}>lift</Text></Text>
        <Text style={styles.title}>{t("auth.register")}</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.username")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.username_placeholder")}
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
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
              <ActivityIndicator color={colors.white} />
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

        <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={styles.guestButton}>
          <Text style={styles.guestText}>{t("auth.continue_guest")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  logoCoach: { color: colors.text, fontSize: 40, fontFamily: fonts.heading, marginBottom: 8 },
  logoLift: { color: colors.coral },
  title: { color: colors.text, fontSize: 26, fontFamily: fonts.bold, marginBottom: 40 },
  form: { gap: 20 },
  field: { gap: 8 },
  label: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semiBold, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: colors.text, fontSize: 15, fontFamily: fonts.body, borderWidth: 1, borderColor: colors.cardBorder,
  },
  button: {
    backgroundColor: colors.coral, borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontFamily: fonts.extraBold },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  footerText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body },
  link: { color: colors.coral, fontSize: 14, fontFamily: fonts.bold },
  guestButton: { alignItems: "center", marginTop: 16 },
  guestText: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.body },
});

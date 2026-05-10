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
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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
      <View style={styles.inner}>
        <Text style={styles.logo}>CoachLift</Text>
        <Text style={styles.title}>{t("auth.login")}</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.email")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.email_placeholder")}
              placeholderTextColor="#888888"
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
              placeholderTextColor="#888888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            onPress={handleLogin}
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.sign_in")}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t("auth.no_account")} </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
            <Text style={styles.link}>{t("auth.sign_up")}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={styles.guestButton}>
          <Text style={styles.guestText}>{t("auth.continue_guest")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  inner: { flex: 1, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  logo: { color: "#E8FF47", fontSize: 36, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  title: { color: "#F5F5F5", fontSize: 26, fontWeight: "700", marginBottom: 40 },
  form: { gap: 20 },
  field: { gap: 8 },
  label: { color: "#888888", fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: "#141414", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: "#F5F5F5", fontSize: 15, borderWidth: 1, borderColor: "#2A2A2A",
  },
  button: {
    backgroundColor: "#E8FF47", borderRadius: 14, paddingVertical: 16,
    alignItems: "center", marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#0A0A0A", fontSize: 16, fontWeight: "800" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  footerText: { color: "#888888", fontSize: 14 },
  link: { color: "#E8FF47", fontSize: 14, fontWeight: "700" },
  guestButton: { alignItems: "center", marginTop: 16 },
  guestText: { color: "#888888", fontSize: 14 },
});

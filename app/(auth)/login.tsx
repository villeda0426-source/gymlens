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
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors, fonts } from "@/constants/theme";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const handleEmailAuth = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    let error: any;
    if (mode === "signin") {
      ({ error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }));
    } else {
      ({ error } = await supabase.auth.signUp({ email: email.trim(), password }));
      if (!error) {
        Alert.alert("Check your email", "We sent you a confirmation link.");
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    if (error) Alert.alert("Error", error.message);
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert("Error", "Apple Sign In failed — no identity token");
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) Alert.alert("Error", error.message);
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Error", e.message || "Apple Sign In failed");
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <View style={styles.logoRow}>
          <Text style={styles.logoCoach}>Coach</Text>
          <Text style={styles.logoLift}>lift</Text>
        </View>
        <Text style={styles.tagline}>Your AI gym coach</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "signin" && styles.modeBtnActive]}
            onPress={() => setMode("signin")}
          >
            <Text style={[styles.modeBtnText, mode === "signin" && styles.modeBtnTextActive]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
            onPress={() => setMode("signup")}
          >
            <Text style={[styles.modeBtnText, mode === "signup" && styles.modeBtnTextActive]}>
              Create Account
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            onPress={handleEmailAuth}
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === "signin" ? "Sign In" : "Create Account"}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {Platform.OS === "ios" && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  logoRow: { flexDirection: "row", marginBottom: 4 },
  logoCoach: { color: colors.text, fontSize: 44, fontFamily: fonts.heading },
  logoLift: { color: colors.coral, fontSize: 44, fontFamily: fonts.heading },
  tagline: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.body, marginBottom: 40 },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: colors.input,
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9 },
  modeBtnActive: { backgroundColor: colors.coral },
  modeBtnText: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.bold },
  modeBtnTextActive: { color: colors.white },
  form: { gap: 20 },
  field: { gap: 8 },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  button: {
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontFamily: fonts.extraBold },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  dividerText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body },
  appleButton: { height: 54, width: "100%" },
});

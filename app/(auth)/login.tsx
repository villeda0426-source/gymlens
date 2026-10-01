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
import * as Crypto from "expo-crypto";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { getAuthRedirectUrl } from "@/lib/authRedirect";
import { Sentry } from "@/lib/sentry";
import { useAuthStore } from "@/store/authStore";
import { coachColors, coachFonts } from "@/constants/theme";

const AUTH_TIMEOUT_MS = 15_000;

function withTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("AUTH_REQUEST_TIMEOUT")), AUTH_TIMEOUT_MS);
  });
  return Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId));
}

async function runSignInRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await withTimeout(request());
  } catch (error: any) {
    const isImmediateNetworkFailure =
      error?.message !== "AUTH_REQUEST_TIMEOUT" &&
      /network request failed|failed to fetch|network error/i.test(error?.message || "");
    if (!isImmediateNetworkFailure) throw error;
    return withTimeout(request());
  }
}

function reportAuthFailure(provider: "email" | "apple", error: any) {
  Sentry.withScope((scope) => {
    scope.setTag("auth.provider", provider);
    scope.setTag("auth.error_code", error?.code || "unknown");
    scope.setContext("auth_failure", {
      status: error?.status,
      message: error?.message,
    });
    Sentry.captureException(error instanceof Error ? error : new Error(error?.message || "Authentication failed"));
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const setUser = useAuthStore((state) => state.setUser);

  const showAuthError = (error: any, provider: "email" | "apple") => {
    reportAuthFailure(provider, error);
    const isNetworkFailure =
      error?.message === "AUTH_REQUEST_TIMEOUT" ||
      /network request failed|failed to fetch|network error/i.test(error?.message || "");
    Alert.alert(
      t("common.error"),
      isNetworkFailure ? t("auth.network_error") : error?.message || t("auth.sign_in_failed")
    );
  };

  const handleEmailAuth = async () => {
    if (loading) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password || (mode === "signup" && !name.trim())) {
      Alert.alert(t("common.error"), t("auth.complete_fields"));
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const { data, error } = await runSignInRequest(
          () => supabase.auth.signInWithPassword({ email: cleanEmail, password })
        );
        if (error) throw error;
        if (!data.session?.user) throw new Error(t("auth.session_failed"));

        // Don't navigate here: isLoading is still true until loadProfile()
        // (triggered by the auth-state-change listener in app/_layout.tsx)
        // finishes, and AuthGate needs the loaded profile to know whether to
        // send this account to /(auth)/birth-year or /(tabs). Navigating
        // immediately raced that load — the person would flash into /(tabs)
        // and then get bounced to birth-year a moment later.
        setUser(data.session.user);
      } else {
        const { error } = await withTimeout(
          supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: { username: name.trim(), full_name: name.trim() },
              emailRedirectTo: getAuthRedirectUrl(),
            },
          })
        );
        if (error) throw error;
        Alert.alert(t("auth.check_email_title"), t("auth.check_email_message"));
      }
    } catch (error: any) {
      showAuthError(error, "email");
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      Sentry.addBreadcrumb({ category: "auth.apple", message: "native_sign_in_started", level: "info" });
      const rawNonce = bytesToHex(await Crypto.getRandomBytesAsync(32));
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      const credential = await AppleAuthentication.signInAsync({
        nonce: hashedNonce,
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error("APPLE_IDENTITY_TOKEN_MISSING");
      }
      Sentry.addBreadcrumb({ category: "auth.apple", message: "native_credential_received", level: "info" });
      const identityToken = credential.identityToken;
      const { data, error } = await runSignInRequest(
        () => supabase.auth.signInWithIdToken({
          provider: "apple",
          token: identityToken,
          nonce: rawNonce,
        })
      );
      if (error) throw error;
      if (!data.session?.user) throw new Error(t("auth.session_failed"));

      const givenName = credential.fullName?.givenName?.trim();
      const familyName = credential.fullName?.familyName?.trim();
      const fullName = [givenName, familyName].filter(Boolean).join(" ");
      if (fullName) {
        const { error: profileError } = await supabase.auth.updateUser({
          data: { full_name: fullName, given_name: givenName, family_name: familyName },
        });
        if (profileError) Sentry.captureException(profileError);
      }

      Sentry.addBreadcrumb({ category: "auth.apple", message: "supabase_session_created", level: "info" });
      setUser(data.session.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        showAuthError(e, "apple");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <View style={styles.formColumn}>
        <View style={styles.logoRow}>
          <Text style={styles.logoCoach}>Spot</Text>
          <Text style={styles.logoLift}>lift</Text>
        </View>
        <Text style={styles.tagline}>{t("auth.tagline")}</Text>

        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "signin" && styles.modeBtnActive]}
            onPress={() => setMode("signin")}
          >
            <Text style={[styles.modeBtnText, mode === "signin" && styles.modeBtnTextActive]}>
              {t("auth.sign_in")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === "signup" && styles.modeBtnActive]}
            onPress={() => setMode("signup")}
          >
            <Text style={[styles.modeBtnText, mode === "signup" && styles.modeBtnTextActive]}>
              {t("auth.create_account")}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {mode === "signup" && (
            <View style={styles.field}>
              <Text style={styles.label}>{t("auth.name")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("auth.username_placeholder")}
                placeholderTextColor={coachColors.textSecondary}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

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
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("auth.password")}</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={coachColors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleEmailAuth}
            />
          </View>

          <TouchableOpacity
            onPress={handleEmailAuth}
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={coachColors.card} />
            ) : (
              <Text style={styles.buttonText}>
                {mode === "signin" ? t("auth.sign_in") : t("auth.create_account")}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("common.or")}</Text>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: coachColors.bg },
  inner: { flexGrow: 1, alignItems: "center", paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  formColumn: { width: "100%", maxWidth: 520 },
  logoRow: { flexDirection: "row", marginBottom: 4 },
  logoCoach: { color: coachColors.text, fontSize: 44, fontFamily: coachFonts.heading },
  logoLift: { color: coachColors.coral, fontSize: 44, fontFamily: coachFonts.heading },
  tagline: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body, marginBottom: 40 },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: coachColors.bg,
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9 },
  modeBtnActive: { backgroundColor: coachColors.coral },
  modeBtnText: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.bodyBold },
  modeBtnTextActive: { color: coachColors.card },
  form: { gap: 20 },
  field: { gap: 8 },
  label: {
    color: coachColors.textSecondary,
    fontSize: 13,
    fontFamily: coachFonts.bodySemiBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: coachColors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: coachColors.text,
    fontSize: 15,
    fontFamily: coachFonts.body,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  button: {
    backgroundColor: coachColors.coral,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: coachColors.card, fontSize: 16, fontFamily: coachFonts.bodyExtraBold },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: coachColors.border },
  dividerText: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body },
  appleButton: { height: 54, width: "100%" },
});

import "../global.css";
import { Sentry } from "@/lib/sentry";
import "@/lib/vexo";
import React, { useEffect } from "react";
import { Alert } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { FeedbackProvider } from "@/context/FeedbackContext";
import AppErrorBoundary from "@/components/UI/AppErrorBoundary";
import ServiceHealthMonitor from "@/components/UI/ServiceHealthMonitor";
import ForceUpdateGate from "@/components/UI/ForceUpdateGate";
import {
  useFonts,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { I18nextProvider } from "react-i18next";
import i18n, { getStoredLanguage } from "@/lib/i18n";
import { useAuthStore } from "@/store/authStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { supabase } from "@/lib/supabase";
import { handleAuthRedirectUrl } from "@/lib/authRedirect";
import { colors } from "@/constants/theme";
import { trackInstallation } from "@/lib/installTracking";

function AuthGate() {
  const { user, isGuest, guestAccessEnabled, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    if (!user && !(isGuest && guestAccessEnabled) && !inAuth) {
      router.replace("/(auth)/login");
    } else if (user && inAuth) {
      router.replace("/(tabs)");
    }
  }, [user, isGuest, guestAccessEnabled, isLoading, segments]);

  return null;
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const { setUser, loadProfile } = useAuthStore();

  useEffect(() => {
    getStoredLanguage().then((lang) => i18n.changeLanguage(lang));
    void trackInstallation();

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        // Preview builds can inherit an expired refresh token from an older
        // session. Clear only the local session and continue as signed out.
        await supabase.auth.signOut({ scope: "local" });
        setUser(null);
        Sentry.setUser(null);
        await loadProfile();
        return;
      }

      setUser(session?.user ?? null);
      Sentry.setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      await loadProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        useCoachTrainerStore.getState().resetChatSession();
      }
      setUser(session?.user ?? null);
      Sentry.setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      loadProfile();
      void trackInstallation();
    });

    const handleUrl = async (url: string) => {
      try {
        const handled = await handleAuthRedirectUrl(url);
        if (handled) {
          const { data: { session } } = await supabase.auth.getSession();
          setUser(session?.user ?? null);
          Sentry.setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
          await loadProfile();
        }
      } catch (err: any) {
        Alert.alert(i18n.t("auth.signin_link_failed"), err.message || i18n.t("auth.request_new_link"));
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const urlSubscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    return () => {
      subscription.unsubscribe();
      urlSubscription.remove();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <AppErrorBoundary>
            <FeedbackProvider>
              <ForceUpdateGate>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(auth)/login" />
                  <Stack.Screen name="(auth)/register" />
                  <Stack.Screen name="auth/callback" />
                  <Stack.Screen name="equipment/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="feedback" options={{ presentation: "modal" }} />
                </Stack>
                <ServiceHealthMonitor />
                <AuthGate />
              </ForceUpdateGate>
            </FeedbackProvider>
          </AppErrorBoundary>
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { apiFetch, getNativeAppVersion, getNativeBuildNumber } from "./api";
import { supabase } from "./supabase";

const INSTALLATION_ID_KEY = "spotlift_installation_id";

function createInstallationId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `install-${Date.now().toString(36)}-${random}`;
}

async function getInstallationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;

  const created = createInstallationId();
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, created);
  return created;
}

/**
 * Records this app installation. The server is idempotent, so it is safe to call
 * on every launch and again after auth changes. Failures never block app startup.
 */
export async function trackInstallation(): Promise<void> {
  try {
    const [installationId, { data }] = await Promise.all([
      getInstallationId(),
      supabase.auth.getSession(),
    ]);

    const locale = Intl.DateTimeFormat().resolvedOptions().locale || null;
    await apiFetch("/api/installations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {}),
      },
      body: JSON.stringify({
        installationId,
        platform: Platform.OS,
        appVersion: getNativeAppVersion(),
        buildNumber: getNativeBuildNumber(),
        locale,
      }),
    });
  } catch (error) {
    if (__DEV__) console.warn("[installTracking] Unable to record installation", error);
  }
}

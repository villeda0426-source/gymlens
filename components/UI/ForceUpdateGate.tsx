import React, { PropsWithChildren, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, fonts } from "@/constants/theme";
import { apiFetch, getNativeBuildNumber, getNativeAppVersion } from "@/lib/api";

type AppVersionPolicy = {
  ios?: {
    minimumBuildNumber?: number;
    latestBuildNumber?: number;
    storeUrl?: string;
  };
  android?: {
    minimumVersionCode?: number;
    latestVersionCode?: number;
    storeUrl?: string;
    webStoreUrl?: string;
  };
};

type GateState = "checking" | "allowed" | "required";

const CHECK_TIMEOUT_MS = 7000;
const APP_STORE_URL = "https://apps.apple.com/us/app/coachlift/id6768139635";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.coachlift.app";

function getRequiredBuild(policy: AppVersionPolicy): number {
  if (Platform.OS === "ios") return policy.ios?.minimumBuildNumber ?? 0;
  if (Platform.OS === "android") return policy.android?.minimumVersionCode ?? 0;
  return 0;
}

function getStoreUrls(policy: AppVersionPolicy) {
  if (Platform.OS === "ios") {
    return { primary: policy.ios?.storeUrl || APP_STORE_URL, fallback: APP_STORE_URL };
  }

  return {
    primary: policy.android?.storeUrl || PLAY_STORE_URL,
    fallback: policy.android?.webStoreUrl || PLAY_STORE_URL,
  };
}

export default function ForceUpdateGate({ children }: PropsWithChildren) {
  const [state, setState] = useState<GateState>("checking");
  const [policy, setPolicy] = useState<AppVersionPolicy | null>(null);

  const currentBuild = useMemo(() => getNativeBuildNumber(), []);
  const currentVersion = useMemo(() => getNativeAppVersion(), []);
  const requiredBuild = policy ? getRequiredBuild(policy) : 0;
  const storeUrls = policy ? getStoreUrls(policy) : { primary: APP_STORE_URL, fallback: APP_STORE_URL };

  const checkVersion = async () => {
    setState("checking");
    try {
      const nextPolicy = await apiFetch<AppVersionPolicy>("/api/app-version", {}, CHECK_TIMEOUT_MS);
      const minimumBuild = getRequiredBuild(nextPolicy);
      setPolicy(nextPolicy);
      setState(minimumBuild > 0 && currentBuild > 0 && currentBuild < minimumBuild ? "required" : "allowed");
    } catch {
      setState("allowed");
    }
  };

  useEffect(() => {
    checkVersion();
  }, []);

  const openStore = async () => {
    const opened = await Linking.openURL(storeUrls.primary).then(() => true).catch(() => false);
    if (!opened && storeUrls.fallback !== storeUrls.primary) {
      await Linking.openURL(storeUrls.fallback).catch(() => undefined);
    }
  };

  if (state === "allowed") return <>{children}</>;

  const isRequired = state === "required";
  const title = isRequired ? "Update required" : "One moment";
  const message = isRequired
    ? "A newer SpotLift version is required to keep workouts, trainer chat, scanning, and plans working correctly."
    : "Checking your SpotLift version.";

  return (
    <View style={styles.screen}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>S</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {isRequired ? (
        <Text style={styles.versionText}>
          Installed {currentVersion} ({currentBuild || "unknown"}) · Required build {requiredBuild}
        </Text>
      ) : null}

      {state === "checking" ? <ActivityIndicator color={colors.coral} style={styles.spinner} /> : null}

      {isRequired ? (
        <Pressable style={styles.primaryButton} onPress={openStore}>
          <Text style={styles.primaryButtonText}>Update SpotLift</Text>
        </Pressable>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: colors.bg,
  },
  brandMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    backgroundColor: colors.coral,
  },
  brandMarkText: {
    color: colors.white,
    fontSize: 36,
    fontFamily: fonts.extraBold,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 23,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 330,
  },
  versionText: {
    marginTop: 16,
    fontFamily: fonts.semiBold,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  spinner: {
    marginTop: 24,
  },
  primaryButton: {
    minWidth: 210,
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    paddingHorizontal: 24,
    backgroundColor: colors.coral,
  },
  primaryButtonText: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.white,
  },
});

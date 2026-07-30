import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const appVersion = Constants.expoConfig?.version;
const iosBuildNumber = Constants.expoConfig?.ios?.buildNumber;
const androidVersionCode = Constants.expoConfig?.android?.versionCode;
const buildNumber = iosBuildNumber ?? (androidVersionCode ? String(androidVersionCode) : undefined);

if (dsn) {
  Sentry.init({
    dsn,
    enabled: !__DEV__,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? "development" : "production"),
    release: appVersion ? `spotlift@${appVersion}` : undefined,
    dist: buildNumber,
    tracesSampleRate: __DEV__ ? 0 : 0.1,
    enableAutoSessionTracking: true,
  });
} else if (!__DEV__) {
  console.warn("Missing EXPO_PUBLIC_SENTRY_DSN; Sentry crash reporting is disabled.");
}

export { Sentry };

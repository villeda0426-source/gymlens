import "./polyfills"; // must be first — sets up WebSocket before any Supabase client initializes
import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import cors from "cors";
import identifyRouter from "./routes/identify";
import searchRouter from "./routes/search";
import equipmentRouter from "./routes/equipment";
import feedbackRouter from "./routes/feedback";
import videosRouter from "./routes/videos";
import workoutSearchRouter from "./routes/workout-search";
import coachTrainerRouter from "./routes/coach-trainer";

const app = express();

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const toInt = (value: string | undefined, fallback = 0) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const appVersionPolicy = {
  ios: {
    minimumBuildNumber: toInt(process.env.MIN_IOS_BUILD_NUMBER),
    latestBuildNumber: toInt(process.env.LATEST_IOS_BUILD_NUMBER, toInt(process.env.MIN_IOS_BUILD_NUMBER)),
    storeUrl: process.env.IOS_STORE_URL || "https://apps.apple.com/us/app/coachlift/id6768139635",
  },
  android: {
    minimumVersionCode: toInt(process.env.MIN_ANDROID_VERSION_CODE),
    latestVersionCode: toInt(process.env.LATEST_ANDROID_VERSION_CODE, toInt(process.env.MIN_ANDROID_VERSION_CODE)),
    storeUrl: process.env.ANDROID_STORE_URL || "market://details?id=com.coachlift.app",
    webStoreUrl: process.env.ANDROID_WEB_STORE_URL || "https://play.google.com/store/apps/details?id=com.coachlift.app",
  },
  forceLegacyClients: process.env.FORCE_UPDATE_REJECT_LEGACY_CLIENTS === "true",
};

app.get("/api/app-version", (_req, res) => {
  res.json(appVersionPolicy);
});

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_REQUESTS = 120;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/api/app-version") {
    next();
    return;
  }

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }

  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
    return;
  }

  next();
});

app.use((req, res, next) => {
  const platform = String(req.header("x-spotlift-platform") || "").toLowerCase();
  const buildValue = req.header("x-spotlift-build");
  const buildNumber = toInt(buildValue);

  if (!platform || !buildValue) {
    if (appVersionPolicy.forceLegacyClients) {
      res.status(426).json({
        updateRequired: true,
        error: "A SpotLift update is required. Please install the latest version from the app store.",
        iosStoreUrl: appVersionPolicy.ios.storeUrl,
        androidStoreUrl: appVersionPolicy.android.storeUrl,
        androidWebStoreUrl: appVersionPolicy.android.webStoreUrl,
      });
      return;
    }
    next();
    return;
  }

  const minimumBuild =
    platform === "ios"
      ? appVersionPolicy.ios.minimumBuildNumber
      : platform === "android"
        ? appVersionPolicy.android.minimumVersionCode
        : 0;

  if (minimumBuild > 0 && buildNumber > 0 && buildNumber < minimumBuild) {
    res.status(426).json({
      updateRequired: true,
      minimumBuild,
      error: "A SpotLift update is required. Please install the latest version from the app store.",
      iosStoreUrl: appVersionPolicy.ios.storeUrl,
      androidStoreUrl: appVersionPolicy.android.storeUrl,
      androidWebStoreUrl: appVersionPolicy.android.webStoreUrl,
    });
    return;
  }

  next();
});

app.use("/api/identify", identifyRouter);
app.use("/api/search", searchRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/videos", videosRouter);
app.use("/workout-search", workoutSearchRouter);
app.use("/api/workout-search", workoutSearchRouter);
app.use("/api/coach-trainer", coachTrainerRouter);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT} (0.0.0.0)`);
});

export default app;

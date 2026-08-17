const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getSentryExpoConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;
const zustandCommonJsEntry = path.join(path.dirname(require.resolve("zustand/package.json")), "index.js");

// Metro's web resolver can select Zustand's ESM build but emit it as a classic
// script, leaving `import.meta.env` in the bundle. Resolve this one dependency
// to its equivalent CommonJS entry so Expo web and native use the same store.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "zustand") {
    return context.resolveRequest(context, zustandCommonJsEntry, platform);
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });

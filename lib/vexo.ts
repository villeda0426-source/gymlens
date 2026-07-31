import Constants from "expo-constants";

const vexoApiKey = process.env.EXPO_PUBLIC_VEXO_API_KEY;

async function initializeVexo() {
  if (Constants.appOwnership === "expo") {
    return;
  }

  if (!vexoApiKey) {
    if (!__DEV__) {
      console.warn("Missing EXPO_PUBLIC_VEXO_API_KEY; Vexo analytics is disabled.");
    }
    return;
  }

  const { vexo } = await import("vexo-analytics");
  vexo(vexoApiKey);
}

void initializeVexo().catch((error) => {
  if (!__DEV__) {
    console.warn("Vexo analytics failed to initialize.", error);
  }
});

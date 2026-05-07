import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import axios from "axios";
import { useEquipmentStore } from "@/store/equipmentStore";
import { useAuthStore } from "@/store/authStore";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";
const MAX_DIMENSION = 1024;
const COMPRESS_QUALITY = 0.7;

export function useEquipmentIdentify() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentResult, addToRecentlyViewed } = useEquipmentStore();
  const { user, isGuest, canUseAsGuest, incrementGuestUses } = useAuthStore();

  const identify = async (imageUri: string) => {
    console.log("[identify] called with URI:", imageUri);
    console.log("[identify] API_BASE:", API_BASE);

    if (!canUseAsGuest()) {
      console.log("[identify] guest limit reached — requiresAuth");
      return { requiresAuth: true };
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("[identify] compressing image...");
      const compressed = await manipulateAsync(
        imageUri,
        [{ resize: { width: MAX_DIMENSION } }],
        { compress: COMPRESS_QUALITY, format: SaveFormat.JPEG }
      );
      console.log("[identify] compressed URI:", compressed.uri);

      console.log("[identify] reading image as base64...");
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log("[identify] base64 length:", base64.length);

      console.log("[identify] posting to", `${API_BASE}/api/identify`);
      const response = await axios.post(
        `${API_BASE}/api/identify`,
        { image: base64, userId: user?.id || null },
        { timeout: 60000 }
      );

      const result = response.data;
      console.log("[identify] success:", result?.name);
      setCurrentResult(result);
      addToRecentlyViewed(result);

      if (isGuest) {
        await incrementGuestUses();
      }

      return { result, requiresAuth: false };
    } catch (err: any) {
      const serverMsg = err.response?.data?.error;
      const isNetworkError = !err.response && (err.message === "Network Error" || err.code === "ECONNABORTED");
      const message = serverMsg
        ?? (isNetworkError
          ? `Cannot reach server at ${API_BASE}. Make sure it is running and your phone is on the same WiFi.`
          : err.message || "Identification failed");

      console.error("[identify] error:", err.message, "| status:", err.response?.status, "| msg:", message);
      setError(message);
      return { error: message };
    } finally {
      setIsLoading(false);
    }
  };

  return { identify, isLoading, error };
}

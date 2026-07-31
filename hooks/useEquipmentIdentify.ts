import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useEquipmentStore } from "@/store/equipmentStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { apiFetch, getApiBase, getApiUnavailableMessage } from "@/lib/api";

const MAX_DIMENSION = 1024;
const COMPRESS_QUALITY = 0.7;

export function useEquipmentIdentify() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentResult, addToRecentlyViewed } = useEquipmentStore();
  const { user, isGuest, canUseAsGuest, incrementGuestUses } = useAuthStore();

  const identify = async (imageUri: string) => {
    console.log("[identify] called with URI:", imageUri);
    console.log("[identify] API_BASE:", getApiBase() ?? "not configured");

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

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      console.log("[identify] posting to /api/identify");
      const result = await apiFetch<any>(
        "/api/identify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ image: base64 }),
        },
        60000
      );
      console.log("[identify] success:", result?.name);
      setCurrentResult(result);
      addToRecentlyViewed(result);

      if (isGuest) {
        await incrementGuestUses();
      }

      return { result, requiresAuth: false };
    } catch (err: any) {
      const message = err?.message || getApiUnavailableMessage();

      console.error("[identify] error:", err.message, "| status:", err.status, "| msg:", message);
      setError(message);
      return { error: message };
    } finally {
      setIsLoading(false);
    }
  };

  return { identify, isLoading, error };
}

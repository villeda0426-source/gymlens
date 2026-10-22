import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useEquipmentStore } from "@/store/equipmentStore";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { apiFetch, getApiBase, getApiUnavailableMessage } from "@/lib/api";

const MAX_DIMENSION = 1024;
const COMPRESS_QUALITY = 0.7;

// Why a scan didn't produce a result, so the message says what to do next:
// fix the connection, take a clearer photo, or simply try again.
export type ScanErrorKind = "connection" | "unclear_photo" | "service";

function scanErrorKind(err: any): ScanErrorKind {
  if (err?.isNetworkError || err?.name === "AbortError") return "connection";
  if (err?.status === 422 || err?.status === 400) return "unclear_photo";
  return "service";
}

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
            // Lets the server return the identification even if saving it
            // fails, so only the save is retried (retrySave below).
            "x-spotlift-save-retry": "1",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ image: base64 }),
        },
        60000
      );
      console.log("[identify] success:", result?.name);
      setCurrentResult(result);
      // Nothing to come back to until it's saved (no id yet).
      if (!result?.save_failed) addToRecentlyViewed(result);

      if (isGuest) {
        await incrementGuestUses();
      }

      return { result, requiresAuth: false };
    } catch (err: any) {
      const message = err?.message || getApiUnavailableMessage();
      const kind = scanErrorKind(err);

      console.error("[identify] error:", err.message, "| status:", err.status, "| kind:", kind);
      setError(message);
      return { error: message, kind };
    } finally {
      setIsLoading(false);
    }
  };

  // The equipment was identified but not saved: retry only the save, with
  // the result the server kept — no new photo, no second identification.
  const retrySave = async (result: any): Promise<{ id?: string; error?: string; expired?: boolean }> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const saved = await apiFetch<{ id: string; identification_id: string | null }>(
        "/api/identify/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ save_token: result.save_token }),
        },
        30000
      );
      const savedResult = { ...result, id: saved.id, identification_id: saved.identification_id, save_failed: false, save_token: undefined };
      setCurrentResult(savedResult);
      addToRecentlyViewed(savedResult);
      return { id: saved.id };
    } catch (err: any) {
      // 410: the server no longer holds this identification (it expired or
      // the server restarted), so retrying the save can't work — the photo
      // has to be identified again.
      return { error: err?.message || getApiUnavailableMessage(), expired: err?.status === 410 };
    }
  };

  return { identify, retrySave, isLoading, error };
}

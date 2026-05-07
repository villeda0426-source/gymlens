import React, { useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import CameraViewComponent from "@/components/Camera/CameraView";
import ImagePreview from "@/components/Camera/ImagePreview";
import LoadingSpinner from "@/components/UI/LoadingSpinner";
import { useEquipmentIdentify } from "@/hooks/useEquipmentIdentify";
import { useAuthStore } from "@/store/authStore";
import GuestPromptModal from "@/components/UI/GuestPromptModal";
import { useTranslation } from "react-i18next";

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const { identify, isLoading, error } = useEquipmentIdentify();
  const { user } = useAuthStore();

  const handleCapture = (uri: string) => {
    console.log("[ScanScreen] captured URI:", uri);
    setCapturedUri(uri);
  };

  const handleIdentify = async () => {
    if (!capturedUri) return;
    console.log("[ScanScreen] handleIdentify called");

    const response = await identify(capturedUri);
    console.log("[ScanScreen] identify response:", JSON.stringify(response));

    if (response?.requiresAuth) {
      setShowGuestPrompt(true);
      return;
    }

    if (response?.error) {
      Alert.alert("Identification Failed", response.error, [{ text: "OK" }]);
      return;
    }

    if (response?.result) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/equipment/${response.result.id || "result"}`);
    }
  };

  return (
    <View style={styles.container}>
      {!capturedUri ? (
        <CameraViewComponent onCapture={handleCapture} />
      ) : isLoading ? (
        <View style={styles.loadingContainer}>
          <LoadingSpinner
            message={t("camera.analyzing")}
            subtitle={t("camera.analyzing_subtitle")}
          />
        </View>
      ) : (
        <ImagePreview
          uri={capturedUri}
          onIdentify={handleIdentify}
          onRetake={() => setCapturedUri(null)}
          isLoading={isLoading}
          error={error}
        />
      )}

      <GuestPromptModal
        visible={showGuestPrompt}
        onClose={() => setShowGuestPrompt(false)}
        onSignUp={() => {
          setShowGuestPrompt(false);
          router.push("/(auth)/register");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
});

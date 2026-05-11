import React, { useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import CameraViewComponent from "@/components/Camera/CameraView";
import ImagePreview from "@/components/Camera/ImagePreview";
import LoadingSpinner from "@/components/UI/LoadingSpinner";
import { useEquipmentIdentify } from "@/hooks/useEquipmentIdentify";
import GuestPromptModal from "@/components/UI/GuestPromptModal";
import { useTranslation } from "react-i18next";
import { colors } from "@/constants/theme";

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const { identify, isLoading, error } = useEquipmentIdentify();

  const handleIdentify = async () => {
    if (!capturedUri) return;
    const response = await identify(capturedUri);
    if (response?.requiresAuth) { setShowGuestPrompt(true); return; }
    if (response?.error) { Alert.alert("Identification Failed", response.error, [{ text: "OK" }]); return; }
    if (response?.result) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/equipment/${response.result.id || "result"}`);
    }
  };

  if (capturedUri) {
    return (
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.loading}>
            <LoadingSpinner message={t("camera.analyzing")} subtitle={t("camera.analyzing_subtitle")} />
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
          onSignUp={() => { setShowGuestPrompt(false); router.push("/(auth)/register"); }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraViewComponent onCapture={setCapturedUri} />
      <GuestPromptModal
        visible={showGuestPrompt}
        onClose={() => setShowGuestPrompt(false)}
        onSignUp={() => { setShowGuestPrompt(false); router.push("/(auth)/register"); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});

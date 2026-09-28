import React, { useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import CameraViewComponent from "@/components/Camera/CameraView";
import ImagePreview from "@/components/Camera/ImagePreview";
import ScanResultSheet from "@/components/Scan/ScanResultSheet";
import LoadingSpinner from "@/components/UI/LoadingSpinner";
import { useEquipmentIdentify } from "@/hooks/useEquipmentIdentify";
import GuestPromptModal from "@/components/UI/GuestPromptModal";
import { useTranslation } from "react-i18next";
import { coachDark } from "@/constants/theme";

interface PendingScanResult {
  id?: string;
  name: string;
  confidence: number;
}

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingResult, setPendingResult] = useState<PendingScanResult | null>(null);
  const { identify, isLoading, error } = useEquipmentIdentify();

  const handleIdentify = async () => {
    if (!capturedUri) return;
    const response = await identify(capturedUri);
    if (response?.requiresAuth) { setShowGuestPrompt(true); return; }
    if (response?.error) { Alert.alert(t("errors.identification_title"), response.error, [{ text: "OK" }]); return; }
    if (response?.result) {
      // Coach Forward Phase 6: confirm the match with ScanResultSheet instead
      // of navigating straight through.
      setPendingResult({
        id: response.result.id,
        name: response.result.name,
        confidence: response.result.confidence ?? 0,
      });
    }
  };

  const handleRetake = () => {
    setPendingResult(null);
    setCapturedUri(null);
  };

  const handleShowMe = async () => {
    if (!pendingResult) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push(`/equipment/${pendingResult.id || "result"}`);
    setPendingResult(null);
  };

  if (capturedUri) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
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
        <ScanResultSheet
          visible={!!pendingResult}
          name={pendingResult?.name ?? ""}
          confidence={pendingResult?.confidence ?? 0}
          onNotThisOne={handleRetake}
          onShowMe={handleShowMe}
        />
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
      <StatusBar style="light" />
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
  container: { flex: 1, backgroundColor: coachDark.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: coachDark.bg },
});

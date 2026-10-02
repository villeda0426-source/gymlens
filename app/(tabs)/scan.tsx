import React, { useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import CameraViewComponent from "@/components/Camera/CameraView";
import ImagePreview from "@/components/Camera/ImagePreview";
import ScanResultSheet, { ScanCandidate } from "@/components/Scan/ScanResultSheet";
import LoadingSpinner from "@/components/UI/LoadingSpinner";
import { useEquipmentIdentify } from "@/hooks/useEquipmentIdentify";
import GuestPromptModal from "@/components/UI/GuestPromptModal";
import { useTranslation } from "react-i18next";
import { coachDark } from "@/constants/theme";

export default function ScanScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  // QA #20: the primary result plus up to 2 alternates (below the 0.75
  // confidence threshold, server/routes/identify.ts's findAlternates) — an
  // empty array means no sheet is shown, same as the old null-pendingResult.
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const { identify, isLoading, error } = useEquipmentIdentify();

  const handleIdentify = async () => {
    if (!capturedUri) return;
    const response = await identify(capturedUri);
    if (response?.requiresAuth) { setShowGuestPrompt(true); return; }
    if (response?.error) { Alert.alert(t("errors.identification_title"), response.error, [{ text: "OK" }]); return; }
    if (response?.result) {
      // Coach Forward Phase 6: confirm the match with ScanResultSheet instead
      // of navigating straight through.
      const primary: ScanCandidate = {
        id: response.result.id,
        name: response.result.name,
        confidence: response.result.confidence ?? 0,
      };
      const alternates: ScanCandidate[] = Array.isArray(response.result.alternates)
        ? response.result.alternates.map((alt: any) => ({ id: alt.id, name: alt.name, confidence: alt.confidence ?? 0 }))
        : [];
      setCandidates([primary, ...alternates]);
    }
  };

  const handleRetake = () => {
    setCandidates([]);
    setCapturedUri(null);
  };

  const handleShowMe = async (candidate: ScanCandidate) => {
    if (!candidate.id) {
      // The server now fails loudly when it can't save a new equipment
      // record, but this stays as a second line of defense: don't silently
      // navigate to a nonexistent /equipment/result route, which renders
      // nothing and looks like a dead button.
      Alert.alert(t("errors.identification_title"), t("scan_result.show_me_unavailable"));
      setCandidates([]);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push(`/equipment/${candidate.id}`);
    setCandidates([]);
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
          visible={candidates.length > 0}
          candidates={candidates}
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

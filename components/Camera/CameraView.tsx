// Coach Forward Scan viewfinder — Phase 6.
//
// The Scan tab sits under the floating tab bar (components/CoachTabBar.tsx),
// so the shutter and upload controls are lifted above it with
// useTabBarSpace() — they used to sit at a fixed bottom: 40, i.e. directly
// underneath the bar, where every tap on the shutter hit the bar instead.
import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  Linking,
  Alert,
  AppState,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useNavigation, useRouter } from "expo-router";
import { CameraView as ExpoCameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import LanguageToggle from "@/components/UI/LanguageToggle";
import { coachColors, coachDark, coachFonts } from "@/constants/theme";
import { useTabBarSpace } from "@/components/CoachTabBar";

const { width, height } = Dimensions.get("window");

interface CameraViewComponentProps {
  onCapture: (uri: string) => void;
}

export default function CameraViewComponent({ onCapture }: CameraViewComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const tabBarSpace = useTabBarSpace();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Coming back from Settings after granting access: re-read the
  // permission instead of leaving the "denied" screen up.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") getPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [getPermission]);

  // Tabs stay mounted, so the camera is only live while Scan is on screen;
  // a fresh session each visit (the old one could come back frozen/black).
  useEffect(() => {
    if (!isFocused) setCameraReady(false);
  }, [isFocused]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !cameraReady || capturing) return;
    setCapturing(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
      if (photo?.uri) onCapture(photo.uri);
    } catch {
      Alert.alert(t("camera.capture_failed_title"), t("camera.capture_failed_message"));
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing, onCapture, t]);

  // The raised Scan button in the tab bar doubles as a shutter while
  // Scan is already open.
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress" as never, () => {
      if (isFocused && permission?.granted) handleCapture();
    });
    return unsubscribe;
  }, [handleCapture, isFocused, navigation, permission?.granted]);

  const handleUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        onCapture(result.assets[0].uri);
      }
    } catch {
      Alert.alert(t("camera.capture_failed_title"), t("camera.upload_failed_message"));
    }
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    const canRequestPermission = permission.canAskAgain;
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>
          {t(canRequestPermission ? "camera.permission_title" : "camera.permission_denied_title")}
        </Text>
        <Text style={styles.permissionMessage}>
          {t(canRequestPermission ? "camera.permission_message" : "camera.permission_denied_message")}
        </Text>
        <TouchableOpacity
          onPress={canRequestPermission ? () => requestPermission() : () => Linking.openSettings()}
          style={styles.permissionButton}
        >
          <Text style={styles.permissionButtonText}>
            {t(canRequestPermission ? "common.continue" : "camera.open_settings")}
          </Text>
        </TouchableOpacity>
        {/* Camera access denied and can't be re-prompted (or the settings
            round-trip doesn't come back granted): scanning is a dead end
            without this, so search-by-name has to stay reachable. */}
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/search")}
          style={styles.searchManuallyButton}
          accessibilityRole="button"
        >
          <Text style={styles.searchManuallyText}>{t("camera.search_manually")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused ? (
        <ExpoCameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
          onMountError={() => Alert.alert(t("camera.capture_failed_title"), t("camera.unavailable_message"))}
        />
      ) : (
        <View style={styles.camera} />
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <View />
          <LanguageToggle />
        </View>

        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <Text style={styles.hint}>{t("camera.capture")}</Text>

        <View style={[styles.controls, { bottom: tabBarSpace + 16 }]}>
          <TouchableOpacity onPress={handleUpload} style={styles.uploadButton}>
            <View style={styles.uploadIconWrap}>
              <Ionicons name="images-outline" size={26} color={coachDark.text} />
            </View>
            <Text style={styles.uploadLabel}>{t("camera.upload")}</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              onPress={handleCapture}
              style={[styles.captureOuter, (!cameraReady || capturing) && styles.captureDisabled]}
              activeOpacity={0.9}
              disabled={!cameraReady || capturing}
              accessibilityRole="button"
              accessibilityLabel={t("camera.take_photo")}
            >
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </Animated.View>

          <View style={{ width: 80 }} />
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const VF_SIZE = width * 0.75;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: coachDark.bg },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  permissionContainer: {
    flex: 1,
    backgroundColor: coachDark.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 8,
  },
  permissionTitle: { color: coachDark.text, fontSize: 22, fontFamily: coachFonts.headingSemiBold, marginBottom: 4, textAlign: "center" },
  permissionMessage: { color: coachDark.textSecondary, fontSize: 15, fontFamily: coachFonts.body, textAlign: "center", marginBottom: 16, lineHeight: 22 },
  permissionButton: {
    backgroundColor: coachColors.coralPressed,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  permissionButtonText: { color: coachDark.text, fontSize: 15, fontFamily: coachFonts.bodyBold },
  searchManuallyButton: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 12 },
  searchManuallyText: { color: coachDark.textSecondary, fontSize: 14, fontFamily: coachFonts.bodySemiBold, textDecorationLine: "underline" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  viewfinder: {
    width: VF_SIZE,
    height: VF_SIZE,
    alignSelf: "center",
    // push viewfinder below the floating greeting header (~110px) plus some breathing room
    marginTop: Math.max((height - VF_SIZE) * 0.1, 110),
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: coachDark.limeOnDark,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  hint: { color: coachDark.textSecondary, fontFamily: coachFonts.body, textAlign: "center", marginTop: 16, fontSize: 13 },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  uploadButton: { width: 80, alignItems: "center" },
  uploadIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  uploadLabel: { color: coachDark.textSecondary, fontSize: 11, fontFamily: coachFonts.body },
  captureOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: coachColors.coralPressed + "40",
    borderWidth: 3,
    borderColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  captureDisabled: { opacity: 0.6 },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: coachColors.coralPressed,
  },
});

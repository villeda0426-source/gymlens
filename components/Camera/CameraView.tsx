// Coach Forward Scan viewfinder — Phase 6.
import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView as ExpoCameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import LanguageToggle from "@/components/UI/LanguageToggle";
import { useTabBarSpace } from "@/components/Navigation/FloatingTabBar";
import { coachColors, coachDark, coachFonts } from "@/constants/theme";

const { width, height } = Dimensions.get("window");

interface CameraViewComponentProps {
  onCapture: (uri: string) => void;
}

export default function CameraViewComponent({ onCapture }: CameraViewComponentProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tabBarSpace = useTabBarSpace();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
    if (photo?.uri) onCapture(photo.uri);
  };

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onCapture(result.assets[0].uri);
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
          onPress={canRequestPermission ? requestPermission : () => Linking.openSettings()}
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
      <ExpoCameraView ref={cameraRef} style={styles.camera} facing="back" />

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

        <View style={[styles.controls, { bottom: tabBarSpace }]}>
          <TouchableOpacity onPress={handleUpload} style={styles.uploadButton}>
            <View style={styles.uploadIconWrap}>
              <Ionicons name="images-outline" size={26} color={coachDark.text} />
            </View>
            <Text style={styles.uploadLabel}>{t("camera.upload")}</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity onPress={handleCapture} style={styles.captureOuter} activeOpacity={0.9}>
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
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: coachColors.coralPressed,
  },
});

import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { CameraView as ExpoCameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import LanguageToggle from "@/components/UI/LanguageToggle";

const { width, height } = Dimensions.get("window");

interface CameraViewComponentProps {
  onCapture: (uri: string) => void;
}

export default function CameraViewComponent({ onCapture }: CameraViewComponentProps) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>{t("camera.permission_title")}</Text>
        <Text style={styles.permissionMessage}>{t("camera.permission_message")}</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>{t("camera.permission_button")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ExpoCameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t("camera.title")}</Text>
          <LanguageToggle />
        </View>

        {/* Viewfinder brackets */}
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <Text style={styles.hint}>{t("camera.capture")}</Text>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={handleUpload} style={styles.uploadButton}>
            <Text style={styles.uploadIcon}>🖼</Text>
            <Text style={styles.uploadLabel}>{t("camera.upload")}</Text>
          </TouchableOpacity>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity onPress={handleCapture} style={styles.captureOuter} activeOpacity={0.9}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </Animated.View>

          <View style={{ width: 80 }} />
        </View>
      </ExpoCameraView>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const VF_SIZE = width * 0.75;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0A" },
  camera: { flex: 1 },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#0A0A0A",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  permissionTitle: { color: "#F5F5F5", fontSize: 22, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  permissionMessage: { color: "#888888", fontSize: 15, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  permissionButton: {
    backgroundColor: "#E8FF47",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  permissionButtonText: { color: "#0A0A0A", fontSize: 15, fontWeight: "700" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: "#E8FF47", fontSize: 24, fontWeight: "900", letterSpacing: 1 },
  viewfinder: {
    width: VF_SIZE,
    height: VF_SIZE,
    alignSelf: "center",
    marginTop: (height - VF_SIZE) * 0.1,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: "#E8FF47",
  },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  hint: { color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 16, fontSize: 13 },
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  uploadButton: { width: 80, alignItems: "center" },
  uploadIcon: { fontSize: 24, marginBottom: 4 },
  uploadLabel: { color: "#F5F5F5", fontSize: 11 },
  captureOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(232,255,71,0.25)",
    borderWidth: 3,
    borderColor: "#E8FF47",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#E8FF47",
  },
});

// Rounded-top bottom sheet — shared primitive from the Coach Forward plan.
// Modeled on the existing MuscleDetailModal's shape (RN Modal, dark
// overlay, slide-up sheet), generalized for reuse (first: ScanResultSheet).
import React from "react";
import { Modal, StyleSheet, View, ViewStyle } from "react-native";
import { coachColors, radii } from "@/constants/theme";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
}

export default function BottomSheet({ visible, onClose, children, style }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, style]}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: coachColors.card,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: 20,
    maxHeight: "80%",
  },
});

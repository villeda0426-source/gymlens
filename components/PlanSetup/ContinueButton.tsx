import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { coachColors, coachFonts } from "@/constants/theme";

interface ContinueButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function ContinueButton({ label, onPress, disabled, loading }: ContinueButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? <ActivityIndicator color={coachColors.card} /> : <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 999,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.4 },
  text: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 18 },
});

// Big-number ± stepper — shared primitive from the Coach Forward plan.
// Dark-screen styling (Workout). Tabular-nums so digit width doesn't jitter.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { coachDark, coachFonts, radii } from "@/constants/theme";

interface StepperProps {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementLabel: string;
  incrementLabel: string;
}

export default function Stepper({ label, value, onDecrement, onIncrement, decrementLabel, incrementLabel }: StepperProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={onDecrement} accessibilityRole="button" accessibilityLabel={decrementLabel}>
          <Text style={styles.buttonText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onIncrement} accessibilityRole="button" accessibilityLabel={incrementLabel}>
          <Text style={styles.buttonText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: coachDark.surface,
    borderRadius: 24,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
  },
  label: { color: coachDark.textSecondary, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.4 },
  value: {
    color: coachDark.text,
    fontFamily: coachFonts.heading,
    fontSize: 72,
    lineHeight: 76,
    fontVariant: ["tabular-nums"],
  },
  row: { flexDirection: "row", gap: 8, width: "100%" },
  button: {
    flex: 1,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: coachDark.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: coachDark.text, fontSize: 26, fontFamily: coachFonts.bodyBold },
});

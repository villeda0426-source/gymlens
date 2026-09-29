// Coach Forward safety caption — Phase 3.
//
// Renders only when a staged plan change actually carries a plan-level
// safety_flags entry (real backend text, e.g. "check with a doctor before
// pushing to high intensity"), never an invented caution.
import React from "react";
import { StyleSheet, Text } from "react-native";
import { coachColors, coachFonts } from "@/constants/theme";

export default function SafetyNote({ text }: { text: string }) {
  return <Text style={styles.text}>{text}</Text>;
}

const styles = StyleSheet.create({
  text: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 18 },
});

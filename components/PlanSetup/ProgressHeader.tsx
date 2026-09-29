// Header for every plan-setup step: back/close (44pt) + 5-segment progress
// bar (navy filled, #e2ddd2 empty) + "N of 5". Matches
// docs/design/build-my-plan/*.html pixel-for-pixel.
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { coachColors, coachFonts } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";

const TOTAL_STEPS = 5;

interface ProgressHeaderProps {
  step: number; // 1-5
  onBack: () => void;
  backLabel: string;
  stepLabel: string; // e.g. "1 of 5" / "1 de 5", already localized
}

export default function ProgressHeader({ step, onBack, backLabel, stepLabel }: ProgressHeaderProps) {
  const isFirst = step <= 1;
  const reduceMotion = useReduceMotion();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        hitSlop={8}
      >
        <Ionicons name={isFirst ? "close" : "chevron-back"} size={isFirst ? 18 : 20} color={coachColors.text} />
      </Pressable>

      <View style={styles.segments}>
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.segment,
              index < step ? styles.segmentFilled : styles.segmentEmpty,
              reduceMotion ? null : styles.segmentTransition,
            ]}
          />
        ))}
      </View>

      <Text style={styles.stepLabel}>{stepLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 2 },
      default: { boxShadow: "0 1px 3px rgba(12,35,64,0.1)" },
    }),
  },
  segments: { flex: 1, flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 999 },
  segmentEmpty: { backgroundColor: "#e2ddd2" },
  segmentFilled: { backgroundColor: coachColors.coachNavy },
  segmentTransition: Platform.select({ web: { transitionProperty: "background-color", transitionDuration: "180ms" } as any, default: null }),
  stepLabel: { fontSize: 13, fontFamily: coachFonts.bodyBold, color: coachColors.textSecondary },
});

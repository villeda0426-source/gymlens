import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { colors, fonts } from "@/constants/theme";

export interface MuscleGain {
  id: string;
  label: string;
  points: number;
}

interface MuscleGainToastProps {
  gains: MuscleGain[];
}

// Floating "+10 Chest" style toasts. Stateless by design — the caller adds
// gains to the array on each completion and clears them after a delay; the
// enter/exit animations run automatically as items are added/removed.
export default function MuscleGainToast({ gains }: MuscleGainToastProps) {
  if (gains.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {gains.map((gain, index) => (
        <Animated.View
          key={gain.id}
          entering={FadeInDown.delay(index * 120).springify().damping(14)}
          exiting={FadeOutUp}
          style={styles.toast}
        >
          <Text style={styles.text}>
            +{gain.points} {gain.label}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 6,
    zIndex: 50,
  },
  toast: {
    backgroundColor: colors.lime,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: colors.lime,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  text: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },
});

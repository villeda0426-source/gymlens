// The AI Coach mark (assets/images/coach-icon.png) — replaces the old star
// everywhere Coach is represented. It's a full-color image, so it can't be
// tinted like an Ionicon: inactive states dim it instead. `badgeSize` puts it
// on a white circle, for spots that sit on navy/dark backgrounds where the
// purple alone wouldn't read.
import React from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { coachColors } from "@/constants/theme";

const COACH_ICON = require("@/assets/images/coach-icon.png");

interface CoachIconProps {
  size?: number;
  badgeSize?: number;
  dimmed?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function CoachIcon({ size = 20, badgeSize, dimmed = false, style }: CoachIconProps) {
  const image = (
    <Image
      source={COACH_ICON}
      style={{ width: size, height: size, opacity: dimmed ? 0.5 : 1 }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );

  if (!badgeSize) return style ? <View style={style}>{image}</View> : image;

  return (
    <View style={[styles.badge, { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 }, style]}>
      {image}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: coachColors.card, alignItems: "center", justifyContent: "center" },
});

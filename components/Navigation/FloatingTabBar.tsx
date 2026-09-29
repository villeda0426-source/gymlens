// "Coach Forward" floating pill tab bar.
//
// Fully custom, absolutely-positioned floating bar (not a docked/reserved
// layout slot — see useTabBarSpace below for why every tab screen has to
// reserve its own bottom padding instead). 5 equal-width slots; Scan is a
// 56px coral circle centered inside the pill; Coach gets a gold sparkle
// icon and an optional unread-news dot.
import React from "react";
import { AccessibilityState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts } from "@/constants/theme";

export const TAB_BAR_HEIGHT = 72;
const SIDE = 16;
const GAP_ABOVE_SAFE_AREA = 6;

// The bar floats via `position: absolute`, so React Navigation reserves no
// space for it — every tab screen has to add this as its own scroll
// container's paddingBottom so content doesn't render underneath the pill.
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + GAP_ABOVE_SAFE_AREA + 16;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

// Visual order per the mockup: Home, Plan, Scan (center), Coach, You.
// This is independent of the underlying route registration order in
// app/(tabs)/_layout.tsx, so file/route names don't need to change.
const TAB_ORDER = ["index", "plan", "scan", "trainer", "profile"] as const;

const ICONS: Record<string, [IoniconsName, IoniconsName]> = {
  index: ["home", "home-outline"],
  plan: ["calendar", "calendar-outline"],
  trainer: ["sparkles", "sparkles-outline"],
  profile: ["person", "person-outline"],
};

const LABEL_KEYS: Record<string, string> = {
  index: "tabs.home",
  plan: "tabs.plan",
  scan: "tabs.scan",
  trainer: "tabs.coach",
  profile: "tabs.you",
};

interface FloatingTabBarProps extends BottomTabBarProps {
  // No coach "unread news" source exists yet (Phase 3/4 introduce the real
  // suggestion/weekly-check-in state this should reflect). Defaults to no
  // badge rather than inventing a fake signal.
  hasCoachNews?: boolean;
}

export default function FloatingTabBar({ state, navigation, hasCoachNews = false }: FloatingTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const handlePress = (routeName: string, routeKey: string, isFocused: boolean) => {
    const event = navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      Haptics.selectionAsync().catch(() => {});
      navigation.navigate(routeName);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + GAP_ABOVE_SAFE_AREA }]}
    >
      <View style={styles.bar}>
        {TAB_ORDER.map((name) => {
          const route = state.routes.find((r) => r.name === name);
          if (!route) return null;
          const routeIndex = state.routes.indexOf(route);
          const isFocused = state.index === routeIndex;
          const label = t(LABEL_KEYS[name]);
          const accessibilityState: AccessibilityState = { selected: isFocused };

          if (name === "scan") {
            return (
              <View key={route.key} style={styles.slot}>
                <Pressable
                  onPress={() => handlePress(route.name, route.key, isFocused)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  hitSlop={8}
                  style={({ pressed }) => [styles.scan, pressed && styles.scanPressed]}
                >
                  <Ionicons name="scan" size={26} color={coachColors.card} />
                </Pressable>
              </View>
            );
          }

          const isCoach = name === "trainer";
          const [on, off] = ICONS[name];
          const tint = isFocused
            ? (isCoach ? coachColors.coachNavy : coachColors.coralPressed)
            : (isCoach ? coachColors.coachNavy : coachColors.textSecondary);

          return (
            <Pressable
              key={route.key}
              onPress={() => handlePress(route.name, route.key, isFocused)}
              style={styles.slot}
              accessibilityRole="tab"
              accessibilityState={accessibilityState}
              accessibilityLabel={isCoach && hasCoachNews ? `${label}, ${t("tabs.coach_unread_badge")}` : label}
              hitSlop={8}
            >
              <View>
                <Ionicons name={isFocused ? on : off} size={22} color={isCoach && isFocused ? coachColors.coachGold : tint} />
                {isCoach && hasCoachNews ? (
                  <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={[
                  styles.label,
                  { color: tint, fontFamily: isFocused ? coachFonts.bodyExtraBold : coachFonts.bodySemiBold },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: SIDE, right: SIDE },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 999,
    backgroundColor: coachColors.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    ...Platform.select({
      ios: {
        shadowColor: coachColors.coachNavy,
        shadowOpacity: 0.16,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
      default: { boxShadow: `0 10px 15px ${coachColors.coachNavy}29` },
    }),
  },
  slot: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 3 },
  scan: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: coachColors.coral,
        shadowOpacity: 0.35,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 6 },
      default: { boxShadow: `0 6px 7px ${coachColors.coral}59` },
    }),
  },
  scanPressed: { transform: [{ scale: 0.96 }] },
  label: { fontSize: 12, lineHeight: 15 },
  dot: {
    position: "absolute",
    top: -2,
    right: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: coachColors.coachGold,
    borderWidth: 2,
    borderColor: coachColors.card,
  },
});

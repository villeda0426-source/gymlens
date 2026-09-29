// "Coach Forward" floating pill tab bar — Phase 2.
//
// Replaces the previous edge-to-edge tab bar with a floating white pill
// (72pt tall, 16pt side inset, 22pt + safe-area from the bottom, soft
// shadow). Labels are always visible (not just on the active tab). Scan is
// a raised 56px coral circle in the center; Coach gets a gold star and an
// optional unread-news dot badge.
import React from "react";
import { AccessibilityState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii } from "@/constants/theme";

export const FLOATING_TAB_BAR_HEIGHT = 72;
export const FLOATING_TAB_BAR_BOTTOM_INSET = 22;
export const FLOATING_TAB_BAR_SIDE_INSET = 16;

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

// Visual order per the mockup: Home, Plan, Scan (center), Coach, You.
// This is independent of the underlying route registration order in
// app/(tabs)/_layout.tsx, so file/route names don't need to change.
const TAB_ORDER = ["index", "plan", "scan", "trainer", "profile"] as const;

const ICONS: Record<string, { outline: IoniconsName; filled: IoniconsName }> = {
  index: { outline: "home-outline", filled: "home" },
  plan: { outline: "calendar-outline", filled: "calendar" },
  trainer: { outline: "star-outline", filled: "star" },
  profile: { outline: "person-outline", filled: "person" },
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
  hasUnreadCoachNews?: boolean;
}

export default function FloatingTabBar({
  state,
  navigation,
  insets,
  hasUnreadCoachNews = false,
}: FloatingTabBarProps) {
  const { t } = useTranslation();

  const handlePress = (routeName: string, routeKey: string, isFocused: boolean) => {
    const event = navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      Haptics.selectionAsync().catch(() => {});
      navigation.navigate(routeName);
    }
  };

  // Docked, not an absolute overlay: the navigator lays this component out
  // as a normal flex sibling below the screen content (see BottomTabView),
  // so reserving real height here is what keeps every tab screen's content
  // from being covered by the pill. The pill itself is visually inset from
  // the reserved slot's edges to read as "floating."
  const bottomInset = insets.bottom + FLOATING_TAB_BAR_BOTTOM_INSET;

  return (
    <View
      style={[
        styles.wrapper,
        { height: FLOATING_TAB_BAR_HEIGHT + bottomInset, paddingBottom: bottomInset },
      ]}
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
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={accessibilityState}
                hitSlop={8}
                onPress={() => handlePress(route.name, route.key, isFocused)}
                style={styles.item}
              >
                {({ pressed }) => (
                  <>
                    <View style={[styles.scanCircle, pressed && styles.scanCirclePressed]}>
                      <Ionicons name="scan" size={26} color={coachColors.card} />
                    </View>
                    <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                      {label}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          }

          const isCoach = name === "trainer";
          const icon = ICONS[name][isFocused ? "filled" : "outline"];
          const iconColor = isCoach
            ? coachColors.coachGoldText
            : isFocused
              ? coachColors.coral
              : coachColors.textSecondary;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={
                isCoach && hasUnreadCoachNews
                  ? `${label}, ${t("tabs.coach_unread_badge")}`
                  : label
              }
              accessibilityState={accessibilityState}
              hitSlop={8}
              onPress={() => handlePress(route.name, route.key, isFocused)}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={icon} size={22} color={iconColor} />
                {isCoach && hasUnreadCoachNews ? (
                  <View style={styles.badgeDot} accessibilityElementsHidden importantForAccessibility="no" />
                ) : null}
              </View>
              <Text
                style={[
                  styles.label,
                  isFocused && !isCoach && styles.labelActive,
                  isCoach && styles.labelCoach,
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
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
  wrapper: {
    paddingHorizontal: FLOATING_TAB_BAR_SIDE_INSET,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    // Stretch (not center): each item fills the full bar height so its own
    // `justifyContent: "flex-end"` can bottom-anchor icon+label consistently
    // across items of different content height (see `item`/`scanCircle`).
    alignItems: "stretch",
    justifyContent: "space-between",
    height: FLOATING_TAB_BAR_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: coachColors.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 10 },
      default: {
        boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
      },
    }),
  },
  item: {
    flex: 1,
    alignItems: "center",
    // Bottom-anchored (not centered) so every item's label sits on the same
    // baseline regardless of content height above it — needed because the
    // Scan item's 56px circle is much taller than the other items' 22px
    // icons and pokes up above the pill via a negative margin.
    justifyContent: "flex-end",
    gap: 3,
    minHeight: 44,
    paddingBottom: 10,
  },
  itemPressed: {
    opacity: 0.7,
  },
  iconWrap: {
    position: "relative",
  },
  badgeDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: coachColors.coachGold,
    borderWidth: 1.5,
    borderColor: coachColors.card,
  },
  label: {
    fontSize: 10,
    fontFamily: coachFonts.bodySemiBold,
    color: coachColors.textSecondary,
  },
  labelActive: {
    color: coachColors.coral,
  },
  labelCoach: {
    color: coachColors.coachGoldText,
  },
  scanCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: coachColors.coral,
    alignItems: "center",
    justifyContent: "center",
    // Raises the circle so it pokes above the pill's top edge, FAB-style,
    // while the label below it stays on the same baseline as the other
    // (bottom-anchored) items.
    marginTop: -18,
    borderWidth: 4,
    borderColor: coachColors.card,
    ...Platform.select({
      ios: {
        shadowColor: coachColors.coral,
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
      default: {
        boxShadow: `0 4px 10px ${coachColors.coralPressed}55`,
      },
    }),
  },
  scanCirclePressed: {
    backgroundColor: coachColors.coralPressed,
  },
});

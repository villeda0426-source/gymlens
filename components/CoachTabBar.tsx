// Coach Forward floating tab bar — rebuilt per QA #14 against mockup-main.png.
//
// Fully custom via the `tabBar` prop on <Tabs> (not a restyle of the default
// React Navigation tab bar, which is what produced the unequal-width/
// safe-area-inside-the-pill bugs this replaces). Floats as an absolute
// overlay, so every tab screen must reserve space for it with
// useTabBarSpace() — see each screen's contentContainerStyle.paddingBottom.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii } from "@/constants/theme";
import CoachIcon from "@/components/Coach/CoachIcon";

export const TAB_BAR_HEIGHT = 72;
const SIDE = 16;
const GAP_ABOVE_SAFE_AREA = 6;

// Screens use this for contentContainerStyle.paddingBottom so nothing hides
// behind the floating bar.
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, 12) + GAP_ABOVE_SAFE_AREA + 16;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

// Visual order per the mockup: Home, Plan, Scan (center), Coach, You. This is
// independent of the route registration order in app/(tabs)/_layout.tsx, so
// file/route names don't need to change. Our Coach route is named "trainer",
// not "coach" — the only route-name deviation from the reference.
const ICONS: Record<string, [IoniconsName, IoniconsName]> = {
  index: ["home", "home-outline"],
  plan: ["calendar", "calendar-outline"],
  profile: ["person", "person-outline"],
};

const LABEL_KEYS: Record<string, string> = {
  index: "tabs.home",
  plan: "tabs.plan",
  scan: "tabs.scan",
  trainer: "tabs.coach",
  profile: "tabs.you",
};

// search/saved/avatar are registered with options.href: null (hidden from
// the tab bar, still reachable by navigation) — state.routes includes them
// regardless, so the bar must filter to only the 5 real tabs or it would
// render buttons for routes that aren't supposed to show here.
const VISIBLE_ROUTE_NAMES = new Set(Object.keys(LABEL_KEYS));

interface CoachTabBarProps extends BottomTabBarProps {
  hasCoachNews?: boolean;
}

export function CoachTabBar({ state, navigation, hasCoachNews = false }: CoachTabBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + GAP_ABOVE_SAFE_AREA }]}
    >
      <View style={styles.bar}>
        {state.routes
          .filter((route) => VISIBLE_ROUTE_NAMES.has(route.name))
          .map((route) => {
          const i = state.routes.indexOf(route);
          const focused = state.index === i;
          const label = t(LABEL_KEYS[route.name] ?? route.name);
          const onPress = () => {
            const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate(route.name);
            }
          };

          // Center camera action: a raised coral circle, labeled like the
          // other tabs so it reads as "Scan" and never as an empty slot. The
          // circle's color lives on an inner View (not a Pressable style
          // function) so it always paints.
          if (route.name === "scan") {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.slot}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                {({ pressed }) => (
                  <>
                    <View style={[styles.scan, pressed && styles.scanPressed]}>
                      <Ionicons name="camera" size={24} color={coachColors.card} />
                    </View>
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.4}
                      style={[styles.label, styles.scanLabel, { fontFamily: focused ? coachFonts.bodyExtraBold : coachFonts.bodySemiBold }]}
                    >
                      {label}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          }

          const isCoach = route.name === "trainer";
          const [on, off] = ICONS[route.name] ?? ["ellipse", "ellipse-outline"];
          // Coach's icon is the full-color AI Coach mark (dimmed when
          // inactive); its label stays navy either way. Non-Coach tabs turn
          // coral on focus, grey otherwise.
          const tint = focused
            ? isCoach
              ? coachColors.coachGold
              : coachColors.coral
            : isCoach
              ? coachColors.coachNavy
              : coachColors.textSecondary;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.slot}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={isCoach && hasCoachNews ? `${label}, ${t("tabs.coach_unread_badge")}` : label}
            >
              <View>
                {isCoach ? (
                  <CoachIcon size={24} dimmed={!focused} />
                ) : (
                  <Ionicons name={focused ? on : off} size={22} color={tint} />
                )}
                {isCoach && hasCoachNews ? (
                  <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no" />
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={[
                  styles.label,
                  { color: isCoach ? coachColors.coachNavy : tint, fontFamily: focused ? coachFonts.bodyExtraBold : coachFonts.bodySemiBold },
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
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: coachColors.border,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 10 },
      default: { boxShadow: "0 6px 16px rgba(0,0,0,0.12)" },
    }),
  },
  // flex: 1 on every slot (including scan's wrapping View) is what makes all
  // 5 equal width — the bug this replaces had the scan slot sized to its
  // content instead.
  slot: { flex: 1, height: 56, alignItems: "center", justifyContent: "center", gap: 3 },
  // Raised: lifted above the bar's centre line and ringed in the bar color
  // so it sits "on" the pill rather than inside it.
  scan: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -22,
    borderWidth: 3,
    borderColor: coachColors.card,
    backgroundColor: coachColors.coral,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: coachColors.coral, shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 6 },
      default: { boxShadow: `0 4px 10px ${coachColors.coralPressed}55` },
    }),
  },
  scanPressed: { backgroundColor: coachColors.coralPressed },
  label: { fontSize: 12, lineHeight: 15 },
  scanLabel: { color: coachColors.text },
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

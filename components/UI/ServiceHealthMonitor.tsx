import { useApiHealth } from "@/hooks/useApiHealth";
import { colors, fonts } from "@/constants/theme";
import {
  FLOATING_TAB_BAR_BOTTOM_INSET,
  FLOATING_TAB_BAR_HEIGHT,
} from "@/components/Navigation/FloatingTabBar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// This banner renders above the Tabs navigator (in app/_layout.tsx), so it
// overlays every screen, including auth screens with no tab bar at all. It
// positions itself relative to the floating pill tab bar's actual footprint
// (docked, safe-area-aware) rather than a fixed guess, so it clears the
// pill on screens that have one and still sits a sensible distance up on
// screens that don't.
const GAP_ABOVE_TAB_BAR = 16;

export default function ServiceHealthMonitor() {
  const { isApiHealthy, checkNow } = useApiHealth();
  const insets = useSafeAreaInsets();

  if (isApiHealthy !== false) return null;

  const bottom =
    insets.bottom + FLOATING_TAB_BAR_BOTTOM_INSET + FLOATING_TAB_BAR_HEIGHT + GAP_ABOVE_TAB_BAR;

  return (
    <View accessibilityRole="alert" style={[styles.banner, { bottom }]}>
      <View style={styles.copy}>
        <Text style={styles.title}>SpotLift is reconnecting</Text>
        <Text style={styles.message}>
          AI features are temporarily unavailable. Your saved workout data is safe.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry SpotLift connection"
        onPress={() => void checkNow()}
        style={styles.retry}
      >
        <Text style={styles.retryText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.coral + "55",
    backgroundColor: colors.card,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  copy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    fontFamily: fonts.body,
  },
  retry: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.coral,
  },
  retryText: {
    color: colors.white,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
});

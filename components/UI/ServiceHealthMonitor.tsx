import { useApiHealth } from "@/hooks/useApiHealth";
import { colors, fonts } from "@/constants/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ServiceHealthMonitor() {
  const { isApiHealthy, checkNow } = useApiHealth();

  if (isApiHealthy !== false) return null;

  return (
    <View accessibilityRole="alert" style={styles.banner}>
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
    bottom: 92,
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

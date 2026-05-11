import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";

interface LoadingSpinnerProps {
  message?: string;
  subtitle?: string;
}

export default function LoadingSpinner({ message, subtitle }: LoadingSpinnerProps) {
  const { t } = useTranslation();
  const rotation = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.1, duration: 600, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.icon, { transform: [{ rotate: spin }, { scale }] }]}>
        <Text style={styles.emoji}>🏋️</Text>
      </Animated.View>
      <Text style={styles.message}>{message || t("camera.analyzing")}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: 32 },
  icon: { marginBottom: 16 },
  emoji: { fontSize: 48 },
  message: { color: colors.coral, fontSize: 20, fontFamily: fonts.bold, textAlign: "center" },
  subtitle: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body, marginTop: 8, textAlign: "center" },
});

// Single-select option card used by Goal / Where / Experience steps. White,
// radius 20, 16 padding, 44pt icon tile, title Outfit 18/700 + one-line
// description. Selected = 2px navy border + navy check circle.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { coachColors, coachFonts } from "@/constants/theme";

interface OptionCardProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}

export default function OptionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  selected,
  onPress,
  accessibilityLabel,
}: OptionCardProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.card, selected && styles.cardSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.iconTile, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {selected ? (
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={14} color={coachColors.card} />
        </View>
      ) : (
        <View style={styles.emptyCircle} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 16,
    backgroundColor: coachColors.card,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardSelected: { borderColor: coachColors.coachNavy },
  iconTile: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { fontFamily: coachFonts.heading, fontSize: 18, color: coachColors.text },
  description: { fontFamily: coachFonts.body, fontSize: 14, color: coachColors.textSecondary },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCircle: { width: 26, height: 26, borderRadius: 999, borderWidth: 2, borderColor: coachColors.border },
});

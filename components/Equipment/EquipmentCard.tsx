import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { colors, fonts } from "@/constants/theme";

interface EquipmentCardProps {
  item: {
    id: string;
    name: string;
    name_es?: string;
    category?: string;
    muscle_groups?: string[];
    difficulty?: string;
    image_url?: string;
  };
  onPress?: () => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: colors.lime,
  intermediate: "#f59e0b",
  advanced: colors.coral,
};

export default function EquipmentCard({ item, onPress }: EquipmentCardProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isEs = i18n.language === "es";

  const name = isEs && item.name_es ? item.name_es : item.name;
  const difficultyColor = DIFFICULTY_COLORS[item.difficulty || "beginner"] || colors.textMuted;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/equipment/${item.id}`);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.card} activeOpacity={0.8}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>🏋️</Text>
        </View>
      )}
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        {item.category && (
          <Text style={styles.category}>
            {t(`equipment.categories.${item.category}`)}
          </Text>
        )}
        <View style={styles.footer}>
          <View style={styles.muscleTags}>
            {(item.muscle_groups || []).slice(0, 2).map((m) => (
              <View key={m} style={styles.muscleTag}>
                <Text style={styles.muscleTagText}>{m}</Text>
              </View>
            ))}
          </View>
          {item.difficulty && (
            <View style={[styles.difficultyBadge, { borderColor: difficultyColor }]}>
              <Text style={[styles.difficultyText, { color: difficultyColor }]}>
                {t(`equipment.${item.difficulty}`)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: "hidden",
    marginBottom: 12,
    flexDirection: "row",
  },
  image: { width: 100, height: 100, resizeMode: "cover" },
  imagePlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.input,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: { fontSize: 32 },
  content: { flex: 1, padding: 12, justifyContent: "space-between" },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bold, marginBottom: 4 },
  category: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semiBold, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  muscleTags: { flexDirection: "row", gap: 4, flex: 1, flexWrap: "wrap" },
  muscleTag: {
    backgroundColor: colors.lime + "18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.lime + "40",
  },
  muscleTagText: { color: colors.lime, fontSize: 10, fontFamily: fonts.semiBold },
  difficultyBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  difficultyText: { fontSize: 10, fontFamily: fonts.bold, textTransform: "uppercase" },
});

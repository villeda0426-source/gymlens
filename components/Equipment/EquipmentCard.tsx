import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

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
  beginner: "#47FF8E",
  intermediate: "#FFB547",
  advanced: "#FF4747",
};

export default function EquipmentCard({ item, onPress }: EquipmentCardProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isEs = i18n.language === "es";

  const name = isEs && item.name_es ? item.name_es : item.name;
  const difficultyColor = DIFFICULTY_COLORS[item.difficulty || "beginner"] || "#888888";

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
    backgroundColor: "#141414",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    overflow: "hidden",
    marginBottom: 12,
    flexDirection: "row",
  },
  image: { width: 100, height: 100, resizeMode: "cover" },
  imagePlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: { fontSize: 32 },
  content: { flex: 1, padding: 12, justifyContent: "space-between" },
  name: { color: "#F5F5F5", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  category: { color: "#888888", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  muscleTags: { flexDirection: "row", gap: 4, flex: 1, flexWrap: "wrap" },
  muscleTag: {
    backgroundColor: "#2A2A2A",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  muscleTagText: { color: "#E8FF47", fontSize: 10, fontWeight: "600" },
  difficultyBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  difficultyText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
});

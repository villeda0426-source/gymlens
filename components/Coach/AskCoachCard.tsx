// Coach Forward "Ask Coach about this machine" card — Phase 6.
//
// Two fixed questions, generic to any equipment (the mockup's second
// question assumes a shoulder issue specific to its demo persona; this
// asks for an easier variation in general, which fits any machine).
// Tapping navigates to the Coach tab with the question pre-filled in the
// composer (not auto-sent) — the user takes the existing chat-send path
// themselves, so nothing is sent to Coach without them seeing it first.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";

export default function AskCoachCard({ equipmentName }: { equipmentName: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  const questions = [
    t("equipment.ask_coach_starting_weight"),
    t("equipment.ask_coach_easier_option"),
  ];

  const askCoach = (question: string) => {
    const withContext = t("equipment.ask_coach_context", { question, equipment: equipmentName });
    router.push({ pathname: "/(tabs)/trainer", params: { ask: withContext } });
  };

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="star" size={16} color={coachColors.coachGold} />
        <Text style={styles.title}>{t("equipment.ask_coach_title")}</Text>
      </View>
      <View style={styles.list}>
        {questions.map((question) => (
          <TouchableOpacity key={question} style={styles.questionButton} onPress={() => askCoach(question)}>
            <Text style={styles.questionText}>{question}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: coachColors.coachNavy,
    borderRadius: radii.card,
    padding: spacing.md + 2,
    gap: spacing.sm + 2,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 14 },
  list: { gap: spacing.sm },
  questionButton: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  questionText: { color: coachColors.card, fontFamily: coachFonts.bodySemiBold, fontSize: 14 },
});

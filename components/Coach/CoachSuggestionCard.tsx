// Coach Forward "SUGGESTED CHANGE" card — Phase 3.
//
// Renders a staged plan_updated response (store: pendingPlanChange). Nothing
// here touches the saved plan — only onApply (wired to
// applyPendingPlanChange) does. When the change is a single exercise swap
// ("Old -> New", the shape the rules-router's swap-applied path always
// produces) it gets the mockup's strikethrough-and-arrow treatment; any
// other shape (e.g. free-text changes from the AI path) falls back to a
// plain bulleted list rather than guessing at a swap that isn't there.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { PendingPlanChange } from "@/store/coachTrainerStore";

const SWAP_PATTERN = /^(.+?)\s*->\s*(.+)$/;

interface CoachSuggestionCardProps {
  response: PendingPlanChange;
  onApply: () => void;
  onKeep: () => void;
}

export default function CoachSuggestionCard({ response, onApply, onKeep }: CoachSuggestionCardProps) {
  const { t } = useTranslation();
  const singleSwap = response.changes.length === 1 ? response.changes[0].match(SWAP_PATTERN) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{t("trainer.coach_suggestion.eyebrow")}</Text>

      {singleSwap ? (
        <View style={styles.swapRow}>
          <Text style={styles.swapOld}>{singleSwap[1]}</Text>
          <Ionicons name="arrow-forward" size={16} color={coachColors.text} />
          <Text style={styles.swapNew}>{singleSwap[2]}</Text>
        </View>
      ) : (
        <View style={styles.changeList}>
          {response.changes.map((change, index) => (
            <Text key={`${index}-${change.slice(0, 24)}`} style={styles.changeItem}>
              {"• "}{change}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.summary}>{response.summary}</Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.applyButton} onPress={onApply} accessibilityRole="button">
          <Text style={styles.applyButtonText}>{t("trainer.coach_suggestion.apply")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.keepButton} onPress={onKeep} accessibilityRole="button">
          <Text style={styles.keepButtonText}>{t("trainer.coach_suggestion.keep")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    backgroundColor: coachColors.card,
    borderWidth: 1.5,
    borderColor: coachColors.coachGold,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  eyebrow: {
    color: coachColors.coachGoldText,
    fontFamily: coachFonts.bodyExtraBold,
    fontSize: 12,
    letterSpacing: 1.6,
  },
  swapRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  swapOld: {
    color: coachColors.textSecondary,
    textDecorationLine: "line-through",
    fontFamily: coachFonts.headingSemiBold,
    fontSize: 17,
  },
  swapNew: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 17 },
  changeList: { gap: 4 },
  changeItem: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 15, lineHeight: 21 },
  summary: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 14, lineHeight: 20 },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  applyButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 14 },
  keepButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  keepButtonText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 14 },
});

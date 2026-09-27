// Coach Forward "Changes for next week" card — Phase 4.
//
// Approve is local-only (lib/coachWeekService.ts's approveCoachWeekChanges
// is a no-op) until a real weekly-check-in backend exists to apply these
// changes; Edit hands off to the Coach chat, where a real change (like
// Phase 3's exercise swap) actually can be made today.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { CoachWeekChange } from "@/lib/coachWeekService";

interface ChangesForNextWeekCardProps {
  changes: CoachWeekChange[];
  onApprove: () => void;
  onEdit: () => void;
}

export default function ChangesForNextWeekCard({ changes, onApprove, onEdit }: ChangesForNextWeekCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="star" size={18} color={coachColors.coachGold} />
        <Text style={styles.title}>{t("coach_week.changes_title")}</Text>
      </View>

      <View style={styles.list}>
        {changes.map((change, index) => (
          <View key={change.id} style={styles.listRow}>
            <Text style={styles.listIndex}>{index + 1}</Text>
            <Text style={styles.listText}>{change.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.approveButton} onPress={onApprove} accessibilityRole="button">
          <Text style={styles.approveButtonText}>{t("coach_week.approve")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.editButton} onPress={onEdit} accessibilityRole="button">
          <Text style={styles.editButtonText}>{t("coach_week.edit")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: coachColors.card,
    borderWidth: 1.5,
    borderColor: coachColors.coachGold,
    borderRadius: radii.cardLarge,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 17 },
  list: { gap: spacing.sm },
  listRow: { flexDirection: "row", gap: spacing.sm },
  listIndex: { color: coachColors.coachGoldText, fontFamily: coachFonts.bodyExtraBold, fontSize: 15, width: 16 },
  listText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21 },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  approveButton: {
    flex: 2,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  approveButtonText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 16 },
  editButton: {
    flex: 1,
    height: 50,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 15 },
});

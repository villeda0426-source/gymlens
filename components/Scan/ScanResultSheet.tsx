// Coach Forward scan result sheet — Phase 6.
//
// Sits between a resolved identify() result and the existing
// router.push("/equipment/[id]") navigation (app/(tabs)/scan.tsx), giving
// the user an explicit confirm/reject step instead of navigating straight
// through. The match-strength badge is derived from the real identify
// result's `confidence`, not a fixed "Strong match" — the mockup's example
// happens to be a strong match, but a real low-confidence result must not
// claim to be one. There's no per-equipment Coach caution to show here (the
// mockup's "go light on this one — your shoulder" line needs a real signal
// tying this specific machine to something Coach knows, which doesn't exist
// today), so that line is left out rather than invented.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import BottomSheet from "@/components/UI/BottomSheet";

interface ScanResultSheetProps {
  visible: boolean;
  name: string;
  confidence: number;
  onNotThisOne: () => void;
  onShowMe: () => void;
}

export default function ScanResultSheet({ visible, name, confidence, onNotThisOne, onShowMe }: ScanResultSheetProps) {
  const { t } = useTranslation();
  const isStrongMatch = confidence >= 0.75;

  return (
    <BottomSheet visible={visible} onClose={onNotThisOne}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="barbell-outline" size={26} color={coachColors.text} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.looksLike}>{t("scan_result.looks_like")}</Text>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
        </View>
        <View style={[styles.badge, isStrongMatch ? styles.badgeStrong : styles.badgePossible]}>
          <Text style={[styles.badgeText, isStrongMatch ? styles.badgeTextStrong : styles.badgeTextPossible]}>
            {t(isStrongMatch ? "scan_result.strong_match" : "scan_result.possible_match")}
          </Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.notThisOneButton} onPress={onNotThisOne} accessibilityRole="button">
          <Text style={styles.notThisOneText}>{t("scan_result.not_this_one")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.showMeButton} onPress={onShowMe} accessibilityRole="button">
          <Text style={styles.showMeText}>{t("scan_result.show_me")}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: coachColors.bg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: { flex: 1, gap: 2 },
  looksLike: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  name: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 22 },
  badge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6 },
  badgeStrong: { backgroundColor: "#eef6e0" },
  badgePossible: { backgroundColor: "#faf1d9" },
  badgeText: { fontFamily: coachFonts.bodyExtraBold, fontSize: 13 },
  badgeTextStrong: { color: coachColors.limeText },
  badgeTextPossible: { color: coachColors.coachGoldText },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  notThisOneButton: {
    flex: 1,
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  notThisOneText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 16 },
  showMeButton: {
    flex: 1,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  showMeText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 16 },
});

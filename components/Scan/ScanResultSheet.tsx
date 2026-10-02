// Coach Forward scan result sheet — Phase 6, extended for QA #20.
//
// Sits between a resolved identify() result and the existing
// router.push("/equipment/[id]") navigation (app/(tabs)/scan.tsx), giving
// the user an explicit confirm/reject step instead of navigating straight
// through. The match-strength badge is derived from the real identify
// result's `confidence`, not a fixed "Strong match" — the mockup's example
// happens to be a strong match, but a real low-confidence result must not
// claim to be one.
//
// QA #20: below the same 0.75 threshold, the server now also returns up to
// two alternate candidates (server/routes/identify.ts's findAlternates).
// When present, the primary result becomes the first page of a horizontal,
// swipeable pager instead of the only guess — the sheet shell (icon/name/
// badge row, Not this one / Show me buttons) is unchanged, just repeated
// per page, with dot indicators when there's more than one candidate. "Show
// me" and "Not this one" always act on whichever page is currently active.
import React, { useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import BottomSheet from "@/components/UI/BottomSheet";

export interface ScanCandidate {
  id?: string;
  name: string;
  confidence: number;
}

interface ScanResultSheetProps {
  visible: boolean;
  candidates: ScanCandidate[];
  onNotThisOne: () => void;
  onShowMe: (candidate: ScanCandidate) => void;
}

const SHEET_PADDING = 20;

export default function ScanResultSheet({ visible, candidates, onNotThisOne, onShowMe }: ScanResultSheetProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const pageWidth = width - SHEET_PADDING * 2;

  // Reset to the primary candidate every time the sheet opens for a new scan.
  React.useEffect(() => {
    if (visible) setActiveIndex(0);
  }, [visible]);

  if (candidates.length === 0) return null;
  const active = candidates[Math.min(activeIndex, candidates.length - 1)];
  const isStrongMatch = active.confidence >= 0.75;

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(Math.max(0, Math.min(index, candidates.length - 1)));
  };

  return (
    <BottomSheet visible={visible} onClose={onNotThisOne}>
      {candidates.length > 1 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          style={{ marginHorizontal: -SHEET_PADDING }}
        >
          {candidates.map((candidate, index) => (
            <View key={candidate.id ?? `${candidate.name}-${index}`} style={{ width: pageWidth, paddingHorizontal: SHEET_PADDING }}>
              <CandidateRow candidate={candidate} t={t} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <CandidateRow candidate={active} t={t} />
      )}

      {candidates.length > 1 ? (
        <View style={styles.dots}>
          {candidates.map((candidate, index) => (
            <View
              key={candidate.id ?? `${candidate.name}-${index}`}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.notThisOneButton} onPress={onNotThisOne} accessibilityRole="button">
          <Text style={styles.notThisOneText}>{t("scan_result.not_this_one")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.showMeButton} onPress={() => onShowMe(active)} accessibilityRole="button">
          <Text style={styles.showMeText}>{t("scan_result.show_me")}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function CandidateRow({ candidate, t }: { candidate: ScanCandidate; t: (key: string) => string }) {
  const isStrongMatch = candidate.confidence >= 0.75;
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Ionicons name="barbell-outline" size={26} color={coachColors.text} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.looksLike}>{t("scan_result.looks_like")}</Text>
        <Text style={styles.name} numberOfLines={2}>{candidate.name}</Text>
      </View>
      <View style={[styles.badge, isStrongMatch ? styles.badgeStrong : styles.badgePossible]}>
        <Text style={[styles.badgeText, isStrongMatch ? styles.badgeTextStrong : styles.badgeTextPossible]}>
          {t(isStrongMatch ? "scan_result.strong_match" : "scan_result.possible_match")}
        </Text>
      </View>
    </View>
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
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: coachColors.border },
  dotActive: { backgroundColor: coachColors.coral, width: 16 },
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

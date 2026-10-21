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
//
// Catalog qualification: under the primary result, the sheet says what the
// match actually rests on (catalog_match, lib/equipmentCatalogMatch.ts) — an
// equipment type from the photo, a brand or model read off a printed label,
// or "not in our catalog" — lists possible models as unconfirmed, and offers
// a retake when a clearer full-machine or model-label photo would help. The
// strong/possible badge is the photo's type confidence; alternates carry no
// score of their own, so they're simply labelled as another possibility.
import React, { useState } from "react";
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import BottomSheet from "@/components/UI/BottomSheet";
import { possibleModels, type CatalogMatch } from "@/lib/equipmentCatalogMatch";

export interface ScanCandidate {
  id?: string;
  name: string;
  // The photo's confidence in this type; absent for alternates.
  confidence?: number;
  // Identified but not saved yet; "Show me" saves it first.
  saveToken?: string;
}

interface ScanResultSheetProps {
  visible: boolean;
  candidates: ScanCandidate[];
  onNotThisOne: () => void;
  onShowMe: (candidate: ScanCandidate) => void;
  saving?: boolean;
  catalogMatch?: CatalogMatch | null;
  onRetake?: () => void;
}

const SHEET_PADDING = 20;

export default function ScanResultSheet({ visible, candidates, onNotThisOne, onShowMe, saving, catalogMatch, onRetake }: ScanResultSheetProps) {
  const { t, i18n } = useTranslation();
  const isEs = i18n.language?.startsWith("es") === true;
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const pageWidth = width - SHEET_PADDING * 2;

  // Reset to the primary candidate every time the sheet opens for a new scan.
  React.useEffect(() => {
    if (visible) setActiveIndex(0);
  }, [visible]);

  if (candidates.length === 0) return null;
  const active = candidates[Math.min(activeIndex, candidates.length - 1)];

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

      {catalogMatch && activeIndex === 0 ? (
        <IdentificationPanel match={catalogMatch} isEs={isEs} t={t} onRetake={onRetake} />
      ) : null}

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.notThisOneButton} onPress={onNotThisOne} accessibilityRole="button">
          <Text style={styles.notThisOneText}>{t("scan_result.not_this_one")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.showMeButton, saving && styles.showMeSaving]}
          onPress={() => onShowMe(active)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ busy: !!saving }}
        >
          {saving ? (
            <ActivityIndicator color={coachColors.card} />
          ) : (
            <Text style={styles.showMeText}>{t("scan_result.show_me")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function IdentificationPanel({
  match,
  isEs,
  t,
  onRetake,
}: {
  match: CatalogMatch;
  isEs: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  onRetake?: () => void;
}) {
  const name = (entry: { display_name: string; display_name_es: string }) => (isEs ? entry.display_name_es : entry.display_name);
  let icon: React.ComponentProps<typeof Ionicons>["name"] = "information-circle-outline";
  let line: string | null = null;
  if (match.status === "unavailable") {
    line = t("scan_result.catalog_unavailable");
  } else if (match.level === "model" && match.item) {
    icon = "pricetag-outline";
    line = t("scan_result.level_model", { name: name(match.item) });
  } else if (match.level === "series" && match.item) {
    icon = "pricetag-outline";
    line = t("scan_result.level_series", { name: name(match.item) });
  } else if (match.level === "manufacturer" && match.manufacturer) {
    line = t("scan_result.level_manufacturer", { brand: match.manufacturer.name });
  } else if (match.level === "type") {
    line = t("scan_result.level_type");
  } else if (match.level === "none") {
    line = t("scan_result.level_none");
  }
  const models = possibleModels(match);
  const retakeKey =
    match.retake_hint === "show_model_label"
      ? "scan_result.retake_model_label"
      : match.retake_hint === "show_full_machine"
        ? "scan_result.retake_full_machine"
        : null;

  if (!line && models.length === 0 && !retakeKey) return null;
  return (
    <View style={styles.panel}>
      {line ? (
        <View style={styles.panelLine}>
          <Ionicons name={icon} size={16} color={coachColors.textSecondary} />
          <Text style={styles.panelText}>{line}</Text>
        </View>
      ) : null}
      {models.length > 0 ? (
        <View style={styles.models}>
          <Text style={styles.modelsTitle}>{t("scan_result.possible_models")}</Text>
          {models.map((model) => (
            <Text key={model.catalog_item_id} style={styles.modelName} numberOfLines={1}>
              {"• "}{name(model)}
            </Text>
          ))}
        </View>
      ) : null}
      {retakeKey && onRetake ? (
        <TouchableOpacity style={styles.retakeButton} onPress={onRetake} accessibilityRole="button">
          <Ionicons name="camera-outline" size={16} color={coachColors.text} />
          <Text style={styles.retakeText}>{t(retakeKey)}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function CandidateRow({ candidate, t }: { candidate: ScanCandidate; t: (key: string) => string }) {
  // Alternates have no score of their own; don't invent one.
  const isAlternate = candidate.confidence === undefined;
  const isStrongMatch = !isAlternate && candidate.confidence! >= 0.75;
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
          {t(isAlternate ? "scan_result.alternative" : isStrongMatch ? "scan_result.strong_match" : "scan_result.possible_match")}
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
  panel: {
    backgroundColor: coachColors.bg,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  panelLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  panelText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 14, lineHeight: 19 },
  models: { gap: 2 },
  modelsTitle: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold, fontSize: 12 },
  modelName: { color: coachColors.text, fontFamily: coachFonts.body, fontSize: 14 },
  retakeButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
  },
  retakeText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 13 },
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
  showMeSaving: { opacity: 0.8 },
  showMeText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 16 },
});

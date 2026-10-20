// Coach's two plan (or workout) options, as swipeable cards in the chat.
// Each shows enough to compare at a glance — focus, exercises, duration,
// intensity — plus "Choose this" (the only thing that saves anything) and
// "Adjust this" (free-text instructions that rework just that option).
// Styled from the Coach card tokens (CoachSuggestionCard / CoachQuestionCard).
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { planOptionStats, type PlanOption } from "@/lib/planOptions";
import { sessionDisplayName, type IntensityLevel } from "@/lib/planSequence";

const INTENSITY_COLORS: Record<IntensityLevel, { bg: string; text: string }> = {
  light: { bg: coachColors.lime + "1f", text: coachColors.limeText },
  moderate: { bg: coachColors.coachGold + "26", text: coachColors.coachGoldText },
  high: { bg: coachColors.coral + "1a", text: coachColors.coralPressed },
};

interface PlanOptionCardsProps {
  options: PlanOption[];
  // "plan" = a whole plan; "workout" = two takes on a single workout.
  kind: "plan" | "workout";
  onChoose: (option: PlanOption) => void;
  onAdjust: (option: PlanOption, instructions: string) => void;
  adjustingId?: string | null;
  disabled?: boolean;
}

export default function PlanOptionCards({ options, kind, onChoose, onAdjust, adjustingId, disabled }: PlanOptionCardsProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  // Leaves the next card peeking in so it's obvious there's a second one.
  const cardWidth = Math.min(300, Math.round((width - 40) * 0.84));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>{t(kind === "plan" ? "plan_options.eyebrow_plan" : "plan_options.eyebrow_workout")}</Text>
      <Text style={styles.hint}>{t("plan_options.hint")}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + spacing.md}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((option) => {
          const stats = planOptionStats(option.plan);
          const firstSession = option.plan.sessions[0];
          const title = kind === "workout" && firstSession ? sessionDisplayName(firstSession) : stats.split;
          const preview = (firstSession?.exercises ?? []).slice(0, 3).map((exercise) => exercise.name);
          const isAdjusting = adjustingId === option.id;
          const isEditing = editingId === option.id;
          const intensityColors = INTENSITY_COLORS[stats.intensity];

          return (
            <View key={option.id} style={[styles.card, { width: cardWidth }]}>
              <View style={styles.cardTop}>
                <Text style={styles.optionLabel}>{t("plan_options.option", { id: option.id })}</Text>
                <View style={[styles.intensityPill, { backgroundColor: intensityColors.bg }]}>
                  <Text style={[styles.intensityText, { color: intensityColors.text }]}>
                    {t(`plan_options.intensity.${stats.intensity}`)}
                  </Text>
                </View>
              </View>

              <Text style={styles.title} numberOfLines={2}>{title}</Text>
              <Text style={styles.focus} numberOfLines={2}>{stats.focus}</Text>

              <View style={styles.statsGrid}>
                {kind === "plan" ? (
                  <Stat icon="calendar-outline" value={String(stats.workoutsPerWeek)} label={t("plan_options.per_week")} />
                ) : null}
                <Stat icon="barbell-outline" value={String(stats.exercisesPerWorkout)} label={t("plan_options.exercises")} />
                <Stat icon="time-outline" value={`~${stats.minutes}`} label={t("plan_options.minutes")} />
              </View>

              {preview.length > 0 ? (
                <View style={styles.preview}>
                  {preview.map((name) => (
                    <View key={name} style={styles.previewRow}>
                      <View style={styles.previewDot} />
                      <Text style={styles.previewText} numberOfLines={1}>{name}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {isEditing ? (
                <View style={styles.adjustBox}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t("plan_options.adjust_placeholder")}
                    placeholderTextColor={coachColors.textSecondary}
                    style={styles.adjustInput}
                    multiline
                    autoFocus
                    accessibilityLabel={t("plan_options.adjust")}
                  />
                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.primaryButton, (!draft.trim() || disabled) && styles.buttonDisabled]}
                      disabled={!draft.trim() || disabled}
                      onPress={() => {
                        onAdjust(option, draft.trim());
                        setEditingId(null);
                        setDraft("");
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.primaryText}>{t("plan_options.adjust_submit")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => {
                        setEditingId(null);
                        setDraft("");
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.secondaryText}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.primaryButton, (disabled || isAdjusting) && styles.buttonDisabled]}
                    disabled={disabled || isAdjusting}
                    onPress={() => onChoose(option)}
                    accessibilityRole="button"
                    accessibilityLabel={t("plan_options.choose_label", { id: option.id })}
                  >
                    <Text style={styles.primaryText}>{t("plan_options.choose")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, (disabled || isAdjusting) && styles.buttonDisabled]}
                    disabled={disabled || isAdjusting}
                    onPress={() => {
                      setEditingId(option.id);
                      setDraft("");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("plan_options.adjust_label", { id: option.id })}
                  >
                    <Ionicons name="create-outline" size={15} color={coachColors.text} />
                    <Text style={styles.secondaryText}>{t("plan_options.adjust")}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isAdjusting ? (
                <View style={styles.adjustingOverlay}>
                  <ActivityIndicator color={coachColors.coachGold} />
                  <Text style={styles.adjustingText}>{t("plan_options.adjusting")}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Stat({ icon, value, label }: { icon: React.ComponentProps<typeof Ionicons>["name"]; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={15} color={coachColors.textSecondary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginHorizontal: -20 },
  eyebrow: {
    color: coachColors.coachGoldText,
    fontFamily: coachFonts.bodyExtraBold,
    fontSize: 12,
    letterSpacing: 1.6,
    paddingHorizontal: 20,
  },
  hint: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 13, paddingHorizontal: 20 },
  row: { paddingHorizontal: 20, paddingVertical: 6, gap: spacing.md },
  card: {
    backgroundColor: coachColors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: "hidden",
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionLabel: { color: coachColors.coral, fontFamily: coachFonts.bodyExtraBold, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase" },
  intensityPill: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  intensityText: { fontFamily: coachFonts.bodyBold, fontSize: 12 },
  title: { color: coachColors.text, fontFamily: coachFonts.headingExtraBold, fontSize: 24, letterSpacing: -0.3 },
  focus: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 14, lineHeight: 19, marginTop: -6 },
  statsGrid: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: coachColors.bg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  statValue: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 18 },
  statLabel: { color: coachColors.textSecondary, fontFamily: coachFonts.bodySemiBold, fontSize: 11 },
  preview: { gap: 6 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: coachColors.coral },
  previewText: { flex: 1, color: coachColors.text, fontFamily: coachFonts.body, fontSize: 14 },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  primaryButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 14 },
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  secondaryText: { color: coachColors.text, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  buttonDisabled: { opacity: 0.5 },
  adjustBox: { gap: spacing.sm },
  adjustInput: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: coachFonts.body,
    fontSize: 15,
    color: coachColors.text,
    textAlignVertical: "top",
  },
  adjustingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.86)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  adjustingText: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
});

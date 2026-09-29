// Coach Forward Phase 3 — profile summary chips at the top of the chat,
// replacing the old Q&A history. Reuses plan-setup's own short option labels
// (goal/where/experience) so the wording never drifts between the two
// screens. Falls back to the plan's own fields for legacy accounts whose
// profile predates the structured plan-setup fields.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, spacing } from "@/constants/theme";
import type { CoachPlan } from "@/lib/coachTrainer";

interface ProfileSummaryChipsProps {
  profile: Record<string, unknown> | null;
  plan: CoachPlan;
}

const GOAL_VALUES = ["strength", "hypertrophy", "fat_loss", "general_fitness"];
const LOCATION_VALUES = ["full_gym", "dumbbells_home", "bodyweight"];
const EXPERIENCE_VALUES = ["beginner", "intermediate", "advanced"];

export default function ProfileSummaryChips({ profile, plan }: ProfileSummaryChipsProps) {
  const { t } = useTranslation();

  const goal = typeof profile?.goal === "string" && GOAL_VALUES.includes(profile.goal as string) ? (profile!.goal as string) : null;
  const location =
    typeof profile?.equipment_type === "string" && LOCATION_VALUES.includes(profile.equipment_type as string)
      ? (profile!.equipment_type as string)
      : null;
  const experience =
    typeof profile?.experience_level === "string" && EXPERIENCE_VALUES.includes(profile.experience_level as string)
      ? (profile!.experience_level as string)
      : null;
  const days = typeof profile?.days_per_week === "number" ? (profile!.days_per_week as number) : plan.days_per_week;
  const minutes = typeof profile?.session_minutes === "number" ? (profile!.session_minutes as number) : null;

  const chips = [
    goal ? t(`plan_setup.goal.options.${goal}.title`) : plan.goal,
    minutes ? t("plan_setup.days.minutes_value_short", { days, minutes }) : t("trainer.days_per_week", { count: days }),
    location ? t(`plan_setup.where.options.${location}.title`) : plan.equipment[0],
    experience ? t(`plan_setup.experience.options.${experience}.title`) : plan.experience_level,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      {chips.map((label, index) => (
        <View key={`${label}-${index}`} style={styles.chip}>
          <Text style={styles.text} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", paddingHorizontal: spacing.xl },
  chip: { backgroundColor: "#ebe7de", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontFamily: coachFonts.bodyBold, fontSize: 12, color: coachColors.textSecondary },
});

import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";
import { useWorkoutLogStore } from "@/store/workoutLogStore";
import {
  LoggedSet,
  WorkoutLogContext,
  computePersonalRecord,
  convertWeight,
  parseNumber,
  roundWeight,
} from "@/lib/workoutLog";

interface Props {
  userId: string;
  ctx: WorkoutLogContext;
}

function displayWeight(set: LoggedSet, unit: WorkoutLogContext["units"]): string {
  if (set.weight == null) return "";
  return String(roundWeight(convertWeight(set.weight, set.unit, unit)));
}

function LogRow({ set, unit, pr }: { set: LoggedSet; unit: WorkoutLogContext["units"]; pr: number | null }) {
  const { t } = useTranslation();
  const updateSet = useWorkoutLogStore((s) => s.updateSet);
  const [reps, setReps] = useState(set.reps == null ? "" : String(set.reps));
  const [weight, setWeight] = useState(displayWeight(set, unit));
  const beatsPr = pr !== null && set.weight != null && roundWeight(convertWeight(set.weight, set.unit, unit)) >= pr && pr > 0;

  const toggleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    updateSet(set.id, { completed: !set.completed });
  };

  return (
    <View style={styles.row}>
      <View style={[styles.cell, styles.prCell]}>
        <Text style={[styles.prText, beatsPr && styles.prTextHit]}>{pr === null ? "—" : pr}</Text>
      </View>
      <View style={[styles.cell, styles.setCell]}>
        <Text style={styles.setText}>{set.setNumber}</Text>
      </View>
      <View style={[styles.cell, styles.inputCell]}>
        <TextInput
          style={styles.input}
          value={reps}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t("workout_log.reps_label", { n: set.setNumber })}
          onChangeText={(text) => {
            setReps(text);
            const n = parseNumber(text);
            updateSet(set.id, { reps: n === null ? null : Math.round(n) });
          }}
        />
      </View>
      <View style={[styles.cell, styles.inputCell]}>
        <TextInput
          style={styles.input}
          value={weight}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={t("workout_log.weight_label", { n: set.setNumber, unit })}
          onChangeText={(text) => {
            setWeight(text);
            updateSet(set.id, { weight: parseNumber(text), unit });
          }}
        />
      </View>
      <View style={[styles.cell, styles.doneCell]}>
        <TouchableOpacity
          onPress={toggleDone}
          style={styles.doneHit}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.completed }}
          accessibilityLabel={t("workout_log.done_label", { n: set.setNumber })}
        >
          <View style={[styles.checkbox, set.completed && styles.checkboxDone]}>
            {set.completed ? <Ionicons name="checkmark" size={18} color={colors.white} /> : null}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function WorkoutLogTable({ userId, ctx }: Props) {
  const { t } = useTranslation();
  const allSets = useWorkoutLogStore((s) => s.sets);
  const ensureSets = useWorkoutLogStore((s) => s.ensureSets);
  const hasLoaded = useWorkoutLogStore((s) => s.hasLoaded);

  useEffect(() => {
    if (hasLoaded) ensureSets(userId, ctx);
  }, [hasLoaded, userId, ctx.exerciseId, ctx.week, ctx.day]);

  const exerciseSets = allSets.filter((s) => s.userId === userId && s.exerciseId === ctx.exerciseId);
  const rows = exerciseSets
    .filter((s) => s.week === ctx.week && s.day === ctx.day)
    .sort((a, b) => a.setNumber - b.setNumber);
  const pr = computePersonalRecord(exerciseSets, ctx.units);

  return (
    <View>
      <Text style={styles.title}>{t("workout_log.title")}</Text>
      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerText, styles.prCell]}>{t("workout_log.pr")}</Text>
          <Text style={[styles.headerText, styles.setCell]}>{t("workout_log.sets")}</Text>
          <Text style={[styles.headerText, styles.inputCell]}>{t("workout_log.reps")}</Text>
          <Text style={[styles.headerText, styles.inputCell]}>{t("workout_log.weight", { unit: ctx.units })}</Text>
          <Text style={[styles.headerText, styles.doneCell]}>{t("workout_log.done")}</Text>
        </View>
        {rows.map((set) => (
          <LogRow key={set.id} set={set} unit={ctx.units} pr={pr} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 22, fontFamily: fonts.heading, marginBottom: 12 },
  table: {
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  headerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  headerText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.bold, textAlign: "center", textTransform: "uppercase" },
  row: {
    flexDirection: "row", alignItems: "center", minHeight: 56,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  cell: { justifyContent: "center", alignItems: "center" },
  prCell: { flex: 0.9 },
  setCell: { flex: 0.7 },
  inputCell: { flex: 1.3, paddingHorizontal: 4 },
  doneCell: { flex: 0.9 },
  prText: { color: colors.textSecondary, fontSize: 16, fontFamily: fonts.semiBold, fontVariant: ["tabular-nums"] },
  prTextHit: { color: colors.lime, fontFamily: fonts.extraBold },
  setText: { color: colors.text, fontSize: 16, fontFamily: fonts.bold, fontVariant: ["tabular-nums"] },
  input: {
    width: "100%", height: 44, borderRadius: 12, backgroundColor: colors.input, textAlign: "center",
    color: colors.text, fontSize: 16, fontFamily: fonts.bold, fontVariant: ["tabular-nums"],
  },
  doneHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  checkbox: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: colors.cardBorder,
    backgroundColor: colors.card, alignItems: "center", justifyContent: "center",
  },
  checkboxDone: { backgroundColor: colors.lime, borderColor: colors.lime },
});

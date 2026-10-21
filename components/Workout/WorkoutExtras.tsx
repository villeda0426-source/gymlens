// "Workout extras" under the Workout Log's set table: optional cardio and
// water for the whole workout (not per exercise — every exercise of the same
// workout shows the same entries). Nothing here is required; missing stays
// missing. Matches the Workout Log's dark panel styling.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import type { Units } from "@/lib/coachTrainer";
import {
  addHydration,
  deleteCardio,
  deleteHydration,
  listCardio,
  listHydration,
  saveCardio,
  type CardioEntry,
  type HydrationEntry,
} from "@/lib/workoutJournal";
import {
  CARDIO_ACTIVITIES,
  hydrationDisplayTotal,
  hydrationQuickAdd,
  parseCardioMinutes,
  type CardioActivity,
} from "@/lib/workoutJournalRules";

const PANEL = "#181819";
const BORDER = "rgba(255,255,255,0.12)";
const TEXT = "#f7f7f7";
const MUTED = "rgba(255,255,255,0.62)";

interface WorkoutExtrasProps {
  userId: string;
  units: Units;
  // The workout this exercise belongs to, if it exists yet.
  sessionId: string | null;
  // Creates the workout on first use (adding water before any set is saved).
  ensureSession: () => Promise<string | null>;
}

type CardioDraft = { id: string | null; activity: CardioActivity | null; minutes: string };

export default function WorkoutExtras({ userId, units, sessionId, ensureSession }: WorkoutExtrasProps) {
  const { t } = useTranslation();
  const [cardio, setCardio] = useState<CardioEntry[]>([]);
  const [water, setWater] = useState<HydrationEntry[]>([]);
  const [draft, setDraft] = useState<CardioDraft | null>(null);
  const [busy, setBusy] = useState<"cardio" | "water" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    Promise.all([listCardio(sessionId), listHydration(sessionId)])
      .then(([cardioRows, waterRows]) => {
        if (cancelled) return;
        setCardio(cardioRows);
        setWater(waterRows);
      })
      .catch(() => {
        if (!cancelled) setError(t("workout_extras.load_failed"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, t]);

  const quick = hydrationQuickAdd(units);
  const total = hydrationDisplayTotal(water.map((entry) => entry.amount_ml), units);
  const unitLabel = (unit: "fl_oz" | "ml") => t(`workout_extras.unit_${unit}`);
  const parsedMinutes = draft ? parseCardioMinutes(draft.minutes) : null;
  const canSaveCardio = !!draft?.activity && parsedMinutes !== "invalid";

  const handleAddWater = async () => {
    if (busy) return;
    setBusy("water");
    setError(null);
    try {
      const id = sessionId ?? (await ensureSession());
      if (!id) throw new Error("no workout");
      const entry = await addHydration({ userId, sessionId: id, units });
      setWater((current) => [...current, entry]);
    } catch {
      setError(t("workout_extras.save_failed"));
    } finally {
      setBusy(null);
    }
  };

  // Undo the most recent addition (an accidental tap).
  const handleRemoveWater = async () => {
    const last = water[water.length - 1];
    if (!last || busy) return;
    setBusy("water");
    setError(null);
    try {
      await deleteHydration(last.id);
      setWater((current) => current.filter((entry) => entry.id !== last.id));
    } catch {
      setError(t("workout_extras.save_failed"));
    } finally {
      setBusy(null);
    }
  };

  const handleSaveCardio = async () => {
    if (!draft?.activity || parsedMinutes === "invalid" || busy) return;
    setBusy("cardio");
    setError(null);
    try {
      const id = sessionId ?? (await ensureSession());
      if (!id) throw new Error("no workout");
      const saved = await saveCardio({ userId, sessionId: id, id: draft.id, activity: draft.activity, durationMinutes: parsedMinutes });
      setCardio((current) => (draft.id ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [...current, saved]));
      setDraft(null);
    } catch {
      // Keep the draft so nothing typed is lost; Save works as the retry.
      setError(t("workout_extras.save_failed"));
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveCardio = async () => {
    if (!draft?.id || busy) return;
    setBusy("cardio");
    setError(null);
    try {
      await deleteCardio(draft.id);
      setCardio((current) => current.filter((entry) => entry.id !== draft.id));
      setDraft(null);
    } catch {
      setError(t("workout_extras.save_failed"));
    } finally {
      setBusy(null);
    }
  };

  const describeCardio = (entry: CardioEntry) =>
    entry.duration_minutes !== null
      ? t("workout_extras.cardio_with_minutes", { activity: t(`workout_extras.activity.${entry.activity}`), minutes: entry.duration_minutes })
      : t(`workout_extras.activity.${entry.activity}`);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t("workout_extras.title")}</Text>
        <View style={styles.optionalPill}>
          <Text style={styles.optionalText}>{t("workout_extras.optional")}</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>{t("workout_extras.subtitle")}</Text>

      {/* Cardio */}
      <View style={styles.row}>
        <Ionicons name="bicycle-outline" size={20} color={MUTED} />
        <View style={styles.rowCopy}>
          <Text style={styles.rowLabel}>{t("workout_extras.cardio")}</Text>
          {cardio.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              onPress={() =>
                setDraft({ id: entry.id, activity: entry.activity, minutes: entry.duration_minutes !== null ? String(entry.duration_minutes) : "" })
              }
              accessibilityRole="button"
              accessibilityLabel={t("workout_extras.edit_cardio_label", { entry: describeCardio(entry) })}
              hitSlop={6}
            >
              <Text style={styles.entryText}>{describeCardio(entry)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {!draft ? (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setDraft({ id: null, activity: null, minutes: "" })}
            accessibilityRole="button"
            accessibilityLabel={t("workout_extras.add_cardio")}
          >
            <Ionicons name="add" size={16} color={TEXT} />
            <Text style={styles.actionText}>{t("workout_extras.add")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {draft ? (
        <View style={styles.form}>
          <Text style={styles.formLabel}>{t("workout_extras.activity_label")}</Text>
          <View style={styles.chips}>
            {CARDIO_ACTIVITIES.map((activity) => {
              const selected = draft.activity === activity;
              return (
                <TouchableOpacity
                  key={activity}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setDraft({ ...draft, activity })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{t(`workout_extras.activity.${activity}`)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.formLabel}>{t("workout_extras.minutes_label")}</Text>
          <TextInput
            value={draft.minutes}
            onChangeText={(minutes) => setDraft({ ...draft, minutes: minutes.replace(/[^0-9.,]/g, "") })}
            keyboardType="decimal-pad"
            placeholder={t("workout_extras.minutes_placeholder")}
            placeholderTextColor={MUTED}
            style={[styles.minutesInput, parsedMinutes === "invalid" && styles.inputInvalid]}
            maxLength={5}
            accessibilityLabel={t("workout_extras.minutes_label")}
          />
          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.saveButton, (!canSaveCardio || busy === "cardio") && styles.disabled]}
              disabled={!canSaveCardio || busy === "cardio"}
              onPress={handleSaveCardio}
              accessibilityRole="button"
            >
              {busy === "cardio" ? <ActivityIndicator color={coachColors.card} /> : <Text style={styles.saveText}>{t("workout_extras.save_cardio")}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setDraft(null)} accessibilityRole="button">
              <Text style={styles.actionText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
          {draft.id ? (
            <TouchableOpacity onPress={handleRemoveCardio} accessibilityRole="button" style={styles.removeLink} hitSlop={8}>
              <Text style={styles.removeText}>{t("workout_extras.remove_cardio")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Water */}
      <View style={[styles.row, styles.rowBorder]}>
        <Ionicons name="water-outline" size={20} color={MUTED} />
        <View style={styles.rowCopy}>
          <Text style={styles.rowLabel}>{t("workout_extras.water")}</Text>
          <Text style={styles.entryText} accessibilityLabel={t("workout_extras.water_total_label", { amount: total.amount, unit: unitLabel(total.unit) })}>
            {t("workout_extras.water_total", { amount: total.amount, unit: unitLabel(total.unit) })}
          </Text>
        </View>
        {water.length > 0 ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleRemoveWater}
            disabled={busy === "water"}
            accessibilityRole="button"
            accessibilityLabel={t("workout_extras.remove_water_label", { amount: quick.amount, unit: unitLabel(quick.unit) })}
          >
            <Ionicons name="remove" size={18} color={TEXT} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleAddWater}
          disabled={busy === "water"}
          accessibilityRole="button"
          accessibilityLabel={t("workout_extras.add_water_label", { amount: quick.amount, unit: unitLabel(quick.unit) })}
        >
          {busy === "water" ? (
            <ActivityIndicator size="small" color={TEXT} />
          ) : (
            <Text style={styles.actionText}>{t("workout_extras.add_water", { amount: quick.amount, unit: unitLabel(quick.unit) })}</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={16} color={coachColors.coral} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: PANEL, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: spacing.lg, gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: TEXT, fontFamily: coachFonts.headingSemiBold, fontSize: 17 },
  optionalPill: { borderRadius: radii.pill, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 8, paddingVertical: 2 },
  optionalText: { color: MUTED, fontFamily: coachFonts.bodyBold, fontSize: 11 },
  subtitle: { color: MUTED, fontFamily: coachFonts.body, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingTop: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: BORDER, marginTop: spacing.xs },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: { color: TEXT, fontFamily: coachFonts.bodyBold, fontSize: 15 },
  entryText: { color: MUTED, fontFamily: coachFonts.bodySemiBold, fontSize: 13, paddingVertical: 2 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.28)",
    justifyContent: "center",
  },
  actionText: { color: TEXT, fontFamily: coachFonts.bodyBold, fontSize: 14 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  form: { gap: spacing.sm, paddingLeft: 32, paddingBottom: spacing.xs },
  formLabel: { color: MUTED, fontFamily: coachFonts.bodyExtraBold, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: BORDER, justifyContent: "center" },
  chipSelected: { backgroundColor: coachColors.lime, borderColor: coachColors.lime },
  chipText: { color: TEXT, fontFamily: coachFonts.bodySemiBold, fontSize: 13 },
  chipTextSelected: { color: "#0e1116" },
  minutesInput: {
    width: 110,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: TEXT,
    fontFamily: coachFonts.bodyBold,
    fontSize: 15,
    paddingHorizontal: 12,
  },
  inputInvalid: { borderColor: coachColors.coral },
  formButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 14 },
  secondaryButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: radii.pill, borderWidth: 1, borderColor: BORDER, justifyContent: "center" },
  disabled: { opacity: 0.45 },
  removeLink: { alignSelf: "flex-start", paddingVertical: 6 },
  removeText: { color: coachColors.coral, fontFamily: coachFonts.bodyBold, fontSize: 13 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: spacing.xs },
  errorText: { flex: 1, color: coachColors.coral, fontFamily: coachFonts.body, fontSize: 12 },
});

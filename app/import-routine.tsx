// QA #19 — import an existing routine (text-based; see shared/importRoutine.ts
// for the scope decision on why this is text, not photo, for now).
import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { buildPlanFromParsedDays, parseRoutineText, type ParsedDay } from "@/shared/importRoutine";

type Step = "input" | "review";

export default function ImportRoutineScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { setPlan, startNewThread } = useCoachTrainerStore();
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [days, setDays] = useState<ParsedDay[]>([]);
  const [importing, setImporting] = useState(false);

  const handleParse = () => {
    const parsed = parseRoutineText(text);
    setDays(parsed);
    setStep("review");
  };

  const matchedCount = days.reduce((sum, day) => sum + day.lines.filter((l) => l.exercise).length, 0);
  const unmatchedCount = days.reduce((sum, day) => sum + day.lines.filter((l) => !l.exercise).length, 0);

  const handleImport = async () => {
    setImporting(true);
    const plan = buildPlanFromParsedDays(days, profile?.preferred_units === "kg" ? "kg" : "lbs");
    setImporting(false);
    if (!plan) {
      return; // handleParse's review screen already shows 0-matched state; nothing to import
    }
    startNewThread();
    setPlan(plan);
    router.replace("/plan");
  };

  return (
    <SafeScreen edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === "review" ? setStep("input") : router.back())} style={styles.backButton} accessibilityRole="button">
          <Ionicons name={step === "review" ? "chevron-back" : "close"} size={20} color={coachColors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t("import_routine.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === "input" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.subtitle}>{t("import_routine.input_subtitle")}</Text>
          <Text style={styles.hint}>{t("import_routine.input_hint")}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("import_routine.input_placeholder")}
            placeholderTextColor={coachColors.textSecondary}
            multiline
            style={styles.textArea}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.primaryButton, !text.trim() && styles.primaryButtonDisabled]}
            onPress={handleParse}
            disabled={!text.trim()}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>{t("import_routine.parse_button")}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            {t("import_routine.review_subtitle", { matched: matchedCount, unmatched: unmatchedCount })}
          </Text>

          {days.map((day, dayIndex) => (
            <View key={`${day.label}-${dayIndex}`} style={styles.daySection}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              {day.lines.map((line, lineIndex) => (
                <View key={`${line.raw}-${lineIndex}`} style={[styles.lineRow, !line.exercise && styles.lineRowUnmatched]}>
                  <Ionicons
                    name={line.exercise ? "checkmark-circle" : "help-circle-outline"}
                    size={20}
                    color={line.exercise ? coachColors.lime : coachColors.coachGoldText}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineRaw}>{line.raw}</Text>
                    <Text style={styles.lineMatch}>
                      {line.exercise
                        ? t("import_routine.matched_as", { name: line.exercise.en })
                        : t("import_routine.not_recognized")}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}

          {unmatchedCount > 0 ? (
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={18} color={coachColors.coachGoldText} />
              <Text style={styles.noticeText}>{t("import_routine.unmatched_notice", { count: unmatchedCount })}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, (matchedCount === 0 || importing) && styles.primaryButtonDisabled]}
            onPress={handleImport}
            disabled={matchedCount === 0 || importing}
            accessibilityRole="button"
          >
            {importing ? (
              <ActivityIndicator color={coachColors.card} />
            ) : (
              <Text style={styles.primaryButtonText}>{t("import_routine.import_button", { count: matchedCount })}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: coachColors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 17 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 48, gap: spacing.md },
  subtitle: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 15, lineHeight: 21 },
  hint: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 19 },
  textArea: {
    minHeight: 220,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    padding: spacing.lg,
    fontFamily: coachFonts.body,
    fontSize: 15,
    color: coachColors.text,
  },
  primaryButton: {
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coralPressed,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: coachColors.card, fontFamily: coachFonts.bodyExtraBold, fontSize: 16 },
  daySection: { gap: spacing.sm },
  dayLabel: { color: coachColors.text, fontFamily: coachFonts.headingSemiBold, fontSize: 16 },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: coachColors.card,
    borderWidth: 1,
    borderColor: coachColors.border,
  },
  lineRowUnmatched: { opacity: 0.75 },
  lineRaw: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, fontSize: 14 },
  lineMatch: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 12, marginTop: 2 },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: "#faf1d9",
  },
  noticeText: { flex: 1, color: coachColors.coachGoldText, fontFamily: coachFonts.body, fontSize: 13, lineHeight: 18 },
});

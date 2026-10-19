// One plan question, popped into the Coach chat as its own card. Built from
// the Build My Plan wizard's own pieces (components/PlanSetup/*: the
// ProgressHeader, OptionCard, Chip and ContinueButton, plus the step
// screens' Coach badge / title / helper header and limitations.tsx's
// free-text field) so it looks and behaves exactly like that flow — just
// inline in the chat, one card per question. The question set lives in
// lib/coachQuestionFlow.ts.
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ProgressHeader from "@/components/PlanSetup/ProgressHeader";
import OptionCard from "@/components/PlanSetup/OptionCard";
import Chip from "@/components/PlanSetup/Chip";
import ContinueButton from "@/components/PlanSetup/ContinueButton";
import { coachColors, coachFonts } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import {
  isAnswerComplete,
  optionLabel,
  type QuestionAnswer,
  type QuestionDef,
} from "@/lib/coachQuestionFlow";

interface CoachQuestionCardProps {
  question: QuestionDef;
  step: number;
  totalSteps: number;
  initialAnswer?: QuestionAnswer;
  onSubmit: (answer: QuestionAnswer) => void;
  // Step 1 shows a close button (cancel the questions); later steps go back.
  onBack: () => void;
  disabled?: boolean;
}

export default function CoachQuestionCard({
  question,
  step,
  totalSteps,
  initialAnswer,
  onSubmit,
  onBack,
  disabled,
}: CoachQuestionCardProps) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const [values, setValues] = useState<string[]>(initialAnswer?.values ?? []);
  const [text, setText] = useState(initialAnswer?.values.length ? initialAnswer.text ?? "" : "");
  const appear = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [appear, reduceMotion]);

  const freeTextOption = question.options.find((option) => option.freeText && values.includes(option.value));
  const answer: QuestionAnswer = { values, text: freeTextOption ? text : undefined };
  const canContinue = values.length > 0 && isAnswerComplete(question, answer);

  const toggle = (value: string) => {
    if (!question.multi) {
      setValues([value]);
      return;
    }
    const option = question.options.find((item) => item.value === value);
    setValues((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (option?.exclusive) return [value];
      const exclusive = new Set(question.options.filter((item) => item.exclusive).map((item) => item.value));
      return [...current.filter((item) => !exclusive.has(item)), value];
    });
  };

  const accessibilityFor = (value: string) => {
    const title = optionLabel(t, question.id, value);
    return values.includes(value) ? t("plan_setup.option_selected", { title }) : title;
  };

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}
    >
      <ProgressHeader
        step={step}
        totalSteps={totalSteps}
        onBack={onBack}
        backLabel={step <= 1 ? t("plan_setup.close") : t("plan_setup.back")}
        stepLabel={t("trainer.question_flow.step_of", { step, total: totalSteps })}
      />

      <View style={styles.header}>
        <View style={styles.coachRow}>
          <View style={styles.coachBadge}>
            <Text style={styles.coachStar}>★</Text>
          </View>
          <Text style={styles.coachLabel}>{t("plan_setup.coach_label")}</Text>
        </View>
        <Text style={styles.title}>{t(`trainer.question_flow.${question.id}.title`)}</Text>
        <Text style={styles.helper}>{t(`trainer.question_flow.${question.id}.helper`)}</Text>
      </View>

      {question.layout === "cards" ? (
        <View style={styles.options}>
          {question.options.map((option) => (
            <OptionCard
              key={option.value}
              icon={option.icon as React.ComponentProps<typeof Ionicons>["name"]}
              iconBg={option.iconBg ?? "transparent"}
              iconColor={option.iconColor ?? coachColors.text}
              title={optionLabel(t, question.id, option.value)}
              description={t(`trainer.question_flow.${question.id}.descriptions.${option.value}`)}
              selected={values.includes(option.value)}
              onPress={() => toggle(option.value)}
              accessibilityLabel={accessibilityFor(option.value)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.chipGrid}>
          {question.options.map((option) => (
            <Chip
              key={option.value}
              label={optionLabel(t, question.id, option.value)}
              selected={values.includes(option.value)}
              onPress={() => toggle(option.value)}
              accessibilityLabel={accessibilityFor(option.value)}
            />
          ))}
        </View>
      )}

      {freeTextOption ? (
        <View style={styles.textField}>
          <Text style={styles.textLabel}>{t(`trainer.question_flow.${question.id}.text_label`)}</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t(`trainer.question_flow.${question.id}.text_placeholder`)}
            placeholderTextColor={coachColors.textSecondary}
            style={styles.textInput}
            accessibilityLabel={t(`trainer.question_flow.${question.id}.text_label`)}
            autoFocus
            multiline
          />
        </View>
      ) : null}

      <ContinueButton
        label={t("plan_setup.continue")}
        onPress={() => onSubmit({ values, text: freeTextOption ? text.trim() : undefined })}
        disabled={!canContinue || disabled}
      />
      <Text style={styles.typeHint}>{t("trainer.question_flow.type_hint")}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.bg,
    padding: 16,
  },
  header: { gap: 8 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  coachBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  coachStar: { color: coachColors.coachGold, fontSize: 13 },
  coachLabel: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.textSecondary },
  title: { fontFamily: coachFonts.heading, fontSize: 24, lineHeight: 29, color: coachColors.text },
  helper: { fontFamily: coachFonts.body, fontSize: 15, color: coachColors.textSecondary },
  options: { gap: 10 },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  textField: { gap: 8 },
  textLabel: { fontFamily: coachFonts.bodyBold, fontSize: 14, color: coachColors.text },
  textInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: coachColors.border,
    backgroundColor: coachColors.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: coachFonts.body,
    fontSize: 15,
    color: coachColors.text,
  },
  typeHint: { fontFamily: coachFonts.body, fontSize: 13, color: coachColors.textSecondary, textAlign: "center" },
});

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, fonts } from "@/constants/theme";

export interface TutorialStep {
  step: number;
  instruction: string;
  instruction_es?: string;
}

interface TutorialStepsProps {
  steps: TutorialStep[];
  isEs?: boolean;
  emptyLabel?: string;
}

export default function TutorialSteps({ steps, isEs, emptyLabel }: TutorialStepsProps) {
  const { t } = useTranslation();
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const resolvedEmptyLabel = emptyLabel ?? t("equipment.tutorial_empty");

  if (steps.length === 0) {
    return <Text style={styles.empty}>{resolvedEmptyLabel}</Text>;
  }

  return (
    <View style={styles.container}>
      {steps.map((step, index) => (
        <TouchableOpacity
          key={step.step ?? index}
          onPress={() => setExpandedStep(expandedStep === index ? null : index)}
          style={styles.stepCard}
          activeOpacity={0.8}
        >
          <View style={styles.stepHeader}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{step.step ?? index + 1}</Text>
            </View>
            <Text style={styles.stepInstruction} numberOfLines={expandedStep === index ? undefined : 2}>
              {isEs && step.instruction_es ? step.instruction_es : step.instruction}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  empty: { color: colors.textMuted, fontFamily: fonts.body, textAlign: "center", paddingVertical: 16 },
  stepCard: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  stepHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  stepNumber: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.coral, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepNumberText: { color: colors.white, fontSize: 14, fontFamily: fonts.extraBold },
  stepInstruction: { color: colors.text, fontSize: 14, fontFamily: fonts.body, lineHeight: 22, flex: 1 },
});

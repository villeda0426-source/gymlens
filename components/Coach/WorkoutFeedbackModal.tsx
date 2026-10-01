import React, { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import SafeScreen from "@/components/Layout/SafeScreen";
import { coachColors, coachFonts } from "@/constants/theme";
import type { WorkoutFeedback } from "@/lib/coachingEngine";

type Props = {
  visible: boolean;
  sessionLabel: string;
  workoutId: string;
  completedExerciseIds: string[];
  totalExerciseCount: number;
  planComplete?: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (feedback: WorkoutFeedback) => void;
};

function Scale({ value, onChange, zero = false }: { value: number; onChange: (value: number) => void; zero?: boolean }) {
  const values = zero ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5];
  return (
    <View style={styles.scale}>
      {values.map((item) => (
        <TouchableOpacity key={item} style={[styles.scaleButton, value === item && styles.scaleButtonActive]} onPress={() => onChange(item)}>
          <Text style={[styles.scaleText, value === item && styles.scaleTextActive]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function WorkoutFeedbackModal(props: Props) {
  const { t } = useTranslation();
  const [difficulty, setDifficulty] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [pain, setPain] = useState(0);
  const [painArea, setPainArea] = useState("");
  const [notes, setNotes] = useState("");

  const submit = () => props.onSubmit({
    workoutId: props.workoutId,
    sessionLabel: props.sessionLabel,
    completedAt: new Date().toISOString(),
    completedExerciseIds: props.completedExerciseIds,
    totalExerciseCount: props.totalExerciseCount,
    difficulty: difficulty as WorkoutFeedback["difficulty"],
    energy: energy as WorkoutFeedback["energy"],
    pain: pain as WorkoutFeedback["pain"],
    painArea: painArea.trim() || undefined,
    notes: notes.trim() || undefined,
    planComplete: props.planComplete === true,
  });

  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
      <SafeScreen edges={["top"]} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{t(props.planComplete ? "coach_feedback.block_complete" : "coach_feedback.check_in")}</Text>
              <Text style={styles.title}>{t(props.planComplete ? "coach_feedback.finished_plan" : "coach_feedback.how_felt")}</Text>
              <Text style={styles.subtitle}>{props.sessionLabel}</Text>
            </View>
            <TouchableOpacity onPress={props.onClose} disabled={props.submitting}><Ionicons name="close" size={24} color={coachColors.text} /></TouchableOpacity>
          </View>

          <View style={styles.card}><Text style={styles.label}>{t("coach_feedback.difficulty")}</Text><Scale value={difficulty} onChange={setDifficulty} /></View>
          <View style={styles.card}><Text style={styles.label}>{t("coach_feedback.energy")}</Text><Scale value={energy} onChange={setEnergy} /></View>
          <View style={styles.card}><Text style={styles.label}>{t("coach_feedback.pain")}</Text><Scale value={pain} onChange={setPain} zero /></View>

          {pain > 0 ? <TextInput style={styles.input} value={painArea} onChangeText={setPainArea} placeholder={t("coach_feedback.pain_area")} placeholderTextColor={coachColors.textSecondary} /> : null}
          <TextInput style={[styles.input, styles.notes]} value={notes} onChangeText={setNotes} placeholder={t("coach_feedback.notes")} placeholderTextColor={coachColors.textSecondary} multiline />

          <Text style={styles.privacy}>
            {props.planComplete
              ? t("coach_feedback.block_privacy")
              : t("coach_feedback.workout_privacy")}
          </Text>
          <TouchableOpacity style={styles.submit} onPress={submit} disabled={props.submitting}>
            {props.submitting ? <ActivityIndicator color={coachColors.card} /> : <Text style={styles.submitText}>{t(props.planComplete ? "coach_feedback.build_next" : "coach_feedback.save_review")}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: coachColors.bg },
  content: { padding: 22, gap: 14 },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  eyebrow: { color: coachColors.coral, fontFamily: coachFonts.bodyBold, fontSize: 11, letterSpacing: 1.2 },
  title: { color: coachColors.text, fontFamily: coachFonts.heading, fontSize: 28, marginTop: 5 },
  subtitle: { color: coachColors.textSecondary, fontFamily: coachFonts.body, marginTop: 4 },
  card: { backgroundColor: coachColors.card, borderColor: coachColors.border, borderWidth: 1, borderRadius: 14, padding: 15 },
  label: { color: coachColors.text, fontFamily: coachFonts.bodySemiBold, marginBottom: 12 },
  scale: { flexDirection: "row", gap: 8 },
  scaleButton: { flex: 1, minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: coachColors.bg },
  scaleButtonActive: { backgroundColor: coachColors.coral },
  scaleText: { color: coachColors.textSecondary, fontFamily: coachFonts.bodyBold },
  scaleTextActive: { color: coachColors.card },
  input: { color: coachColors.text, backgroundColor: coachColors.bg, borderColor: coachColors.border, borderWidth: 1, borderRadius: 12, padding: 14, fontFamily: coachFonts.body },
  notes: { minHeight: 92, textAlignVertical: "top" },
  privacy: { color: coachColors.textSecondary, fontFamily: coachFonts.body, fontSize: 12, lineHeight: 18 },
  submit: { minHeight: 52, borderRadius: 13, backgroundColor: coachColors.coral, alignItems: "center", justifyContent: "center" },
  submitText: { color: coachColors.card, fontFamily: coachFonts.bodyBold, fontSize: 15 },
});

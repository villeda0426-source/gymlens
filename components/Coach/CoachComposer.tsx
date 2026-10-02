// Coach Forward chat composer — Phase 3.
//
// Pill-shaped input row per the mockup, plus a mic button that reuses the
// existing speech-recognition wiring from trainer.tsx. That circle swaps to
// a send arrow once there's text to send, and to a spinner while a request
// is in flight. The camera button (QA #3) was a dead end — it just routed
// to the Scan tab with no context carried over — removed rather than wired
// to something invented for it.
import React from "react";
import { ActivityIndicator, Platform, StyleSheet, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { coachColors, coachFonts, radii, spacing } from "@/constants/theme";

interface CoachComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onVoicePress: () => void;
  listening: boolean;
  loading: boolean;
  placeholder: string;
}

export default function CoachComposer({
  value,
  onChangeText,
  onSend,
  onVoicePress,
  listening,
  loading,
  placeholder,
}: CoachComposerProps) {
  const { t } = useTranslation();
  const hasDraft = value.trim().length > 0;

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={coachColors.textSecondary}
        multiline
        style={styles.input}
        accessibilityLabel={placeholder}
      />
      <TouchableOpacity
        style={[styles.actionButton, listening && styles.actionButtonListening]}
        onPress={hasDraft ? onSend : onVoicePress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={
          hasDraft
            ? t("trainer.coach_composer.send")
            : listening
              ? t("trainer.voice_stop")
              : t("trainer.voice_start")
        }
      >
        {loading ? (
          <ActivityIndicator color={coachColors.card} size="small" />
        ) : (
          <Ionicons
            name={hasDraft ? "send" : listening ? "mic" : "mic-outline"}
            size={19}
            color={coachColors.card}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: coachColors.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: spacing.lg,
    paddingRight: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
      default: { boxShadow: "0 1px 3px rgba(12,35,64,0.1)" },
    }),
  },
  input: {
    flex: 1,
    maxHeight: 40,
    fontFamily: coachFonts.body,
    fontSize: 15,
    color: coachColors.text,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonListening: {
    backgroundColor: coachColors.coralPressed,
  },
});

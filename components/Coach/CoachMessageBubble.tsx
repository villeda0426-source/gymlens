// Coach Forward chat bubble — Phase 3.
//
// User bubble: near-black, tail bottom-right. Assistant bubble: white card,
// tail bottom-left. Matches the Coach.html mockup; no per-message avatar
// (the screen header already carries the coach star, so repeating it on
// every assistant row would be noise the mockup doesn't have either).
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { coachColors, coachFonts, radii } from "@/constants/theme";
import { CoachMessage } from "@/lib/coachTrainer";

export default function CoachMessageBubble({ message }: { message: CoachMessage }) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  rowUser: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: coachColors.card,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderBottomRightRadius: radii.card,
    borderBottomLeftRadius: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 2px rgba(12,35,64,0.06)" },
    }),
  },
  userBubble: {
    backgroundColor: coachColors.text,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: 6,
  },
  text: { color: coachColors.text, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21 },
  userText: { color: coachColors.card },
});

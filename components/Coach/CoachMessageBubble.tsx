// Coach Forward chat bubble — Phase 3.
//
// User bubble: navy, tail bottom-right. Assistant bubble: white card with a
// 26pt coach avatar, tail bottom-left. Matches the Chat.png mockup. Max
// bubble width 80%.
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { coachColors, coachFonts, radii } from "@/constants/theme";
import { CoachMessage } from "@/lib/coachTrainer";

export default function CoachMessageBubble({ message }: { message: CoachMessage }) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {!isUser ? (
        <View style={styles.avatar}>
          <Ionicons name="star" size={12} color={coachColors.coachGold} />
        </View>
      ) : null}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  rowUser: { justifyContent: "flex-end" },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: coachColors.coachNavy,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    maxWidth: "80%",
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
    backgroundColor: coachColors.coachNavy,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: 6,
  },
  text: { color: coachColors.text, fontFamily: coachFonts.body, fontSize: 15, lineHeight: 21 },
  userText: { color: coachColors.card },
});

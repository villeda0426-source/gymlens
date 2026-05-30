import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useFeedback } from "@/context/FeedbackContext";

export function FeedbackButton() {
  const { openFeedback } = useFeedback();

  return (
    <TouchableOpacity style={styles.btn} onPress={openFeedback} activeOpacity={0.8}>
      <Text style={styles.icon}>💬</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "absolute",
    top: 54,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6AAA00",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  icon: {
    fontSize: 20,
  },
});

// N-segment set-progress bar — shared primitive from the Coach Forward
// plan. Dark-screen styling (Workout): lime = done, coral = current,
// raised-dark = upcoming.
import React from "react";
import { StyleSheet, View } from "react-native";
import { coachDark } from "@/constants/theme";

export type SegmentStatus = "done" | "current" | "upcoming";

interface SegmentedProgressBarProps {
  count: number;
  currentIndex: number;
}

function statusFor(index: number, currentIndex: number): SegmentStatus {
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export default function SegmentedProgressBar({ count, currentIndex }: SegmentedProgressBarProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, index) => {
        const status = statusFor(index, currentIndex);
        return (
          <View
            key={index}
            style={[
              styles.segment,
              status === "done" && styles.segmentDone,
              status === "current" && styles.segmentCurrent,
              status === "upcoming" && styles.segmentUpcoming,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  segmentDone: { backgroundColor: coachDark.limeOnDark },
  segmentCurrent: { backgroundColor: coachDark.coralOnDark },
  segmentUpcoming: { backgroundColor: coachDark.raised },
});

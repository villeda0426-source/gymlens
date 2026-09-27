// Simple N-bar chart — shared primitive from the Coach Forward plan.
// Used today by WeekProgressHeader (Phase 4); any screen needing a small
// bar-per-day/value chart can reuse it.
import React from "react";
import { StyleSheet, View } from "react-native";

export interface BarChartBar {
  key: string;
  // 0-1.
  value: number;
  color: string;
}

interface BarChartProps {
  bars: BarChartBar[];
  height?: number;
  trackColor?: string;
}

export default function BarChart({ bars, height = 70, trackColor = "rgba(255,255,255,0.18)" }: BarChartProps) {
  return (
    <View style={[styles.row, { height }]}>
      {bars.map((bar) => (
        <View key={bar.key} style={styles.column}>
          <View
            style={[
              styles.bar,
              {
                height: `${Math.max(0.05, Math.min(1, bar.value)) * 100}%`,
                backgroundColor: bar.value > 0.15 ? bar.color : trackColor,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  column: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4, minHeight: 6 },
});

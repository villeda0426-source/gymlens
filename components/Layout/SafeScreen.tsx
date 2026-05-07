import React from "react";
import { View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface SafeScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ("top" | "bottom" | "left" | "right")[];
}

export default function SafeScreen({ children, style, edges = ["top", "bottom"] }: SafeScreenProps) {
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: "#0A0A0A" }, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

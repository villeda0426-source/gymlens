import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fonts } from "@/constants/theme";

export interface DetailTab {
  key: string;
  label: string;
}

interface DetailTabBarProps {
  tabs: DetailTab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export default function DetailTabBar({ tabs, activeTab, onChange }: DetailTabBarProps) {
  return (
    <View style={styles.tabBarWrap}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
        >
          <Text
            style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    flexDirection: "row",
    backgroundColor: colors.input,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 20,
    gap: 3,
  },
  tab: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  tabActive: {
    backgroundColor: colors.coral,
    shadowColor: colors.coral,
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tabText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.semiBold, textAlign: "center" },
  tabTextActive: { color: colors.white },
});

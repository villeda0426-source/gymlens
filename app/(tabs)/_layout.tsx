import React from "react";
import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "@/constants/theme";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

interface TabIconProps {
  icon: IoniconsName;
  iconFocused: IoniconsName;
  label: string;
  focused: boolean;
}

function TabIcon({ icon, iconFocused, label, focused }: TabIconProps) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.dot, focused && styles.dotActive]}>
        <Ionicons
          name={focused ? iconFocused : icon}
          size={18}
          color={focused ? colors.white : colors.textMuted}
        />
      </View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="home-outline" iconFocused="home" label={t("tabs.home")} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="trainer"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="barbell-outline" iconFocused="barbell" label={t("tabs.trainer")} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          tabBarStyle: [styles.tabBar, styles.planTabBar],
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="calendar-outline" iconFocused="calendar" label={t("tabs.plan")} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="scan-outline" iconFocused="scan" label={t("tabs.scan")} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="person-outline" iconFocused="person" label={t("tabs.profile")} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="avatar"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.cardBorder,
    borderTopWidth: 1,
    height: 76,
    paddingBottom: 10,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  planTabBar: {
    backgroundColor: "#111112",
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  tabItem: {
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  dot: {
    width: 40,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  dotActive: {
    backgroundColor: colors.coral,
  },
  label: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: fonts.semiBold,
  },
  labelActive: {
    color: colors.coral,
  },
});

import React from "react";
import { Tabs } from "expo-router";
import FloatingTabBar from "@/components/Navigation/FloatingTabBar";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";

export default function TabsLayout() {
  // A pending (not-yet-applied) Coach plan change is real "Coach has news":
  // it's exactly what the Home coach card's own gold badge reacts to.
  const hasUnreadCoachNews = useCoachTrainerStore((state) => state.pendingPlanChange !== null);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} hasUnreadCoachNews={hasUnreadCoachNews} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="trainer" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="scan" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="avatar" options={{ href: null }} />
    </Tabs>
  );
}

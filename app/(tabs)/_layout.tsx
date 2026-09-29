import React from "react";
import { Tabs } from "expo-router";
import FloatingTabBar from "@/components/Navigation/FloatingTabBar";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        // TODO(coach-forward phase 3/4): drive this from real "unread coach
        // news" state (e.g. a pending suggestion or an unseen weekly
        // check-in) once that state exists in coachTrainerStore. No such
        // signal exists yet, so the badge stays off rather than faking one.
        <FloatingTabBar {...props} hasUnreadCoachNews={false} />
      )}
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

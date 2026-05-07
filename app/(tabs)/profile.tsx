import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import SafeScreen from "@/components/Layout/SafeScreen";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import LanguageToggle from "@/components/UI/LanguageToggle";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, profile, signOut } = useAuthStore();
  const [historyCount, setHistoryCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase.from("equipment_identifications").select("id", { count: "exact" }).eq("user_id", user.id)
      .then(({ count }) => setHistoryCount(count || 0));
    supabase.from("saved_equipment").select("id", { count: "exact" }).eq("user_id", user.id)
      .then(({ count }) => setSavedCount(count || 0));
  }, [user]);

  const handleSignOut = () => {
    Alert.alert(t("auth.logout"), "Are you sure?", [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("auth.logout"), style: "destructive", onPress: signOut },
    ]);
  };

  if (!user) {
    return (
      <SafeScreen>
        <View style={styles.guest}>
          <Text style={styles.guestEmoji}>👤</Text>
          <Text style={styles.guestTitle}>{t("profile.title")}</Text>
          <Text style={styles.guestSubtitle}>{t("auth.signup_prompt_message")}</Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={styles.signUpButton}>
            <Text style={styles.signUpText}>{t("auth.sign_up")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")} style={styles.loginButton}>
            <Text style={styles.loginText}>{t("auth.sign_in")}</Text>
          </TouchableOpacity>
        </View>
      </SafeScreen>
    );
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  return (
    <SafeScreen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.username || user.email || "?")[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.username}>{profile?.username || user.email}</Text>
          {memberSince ? (
            <Text style={styles.memberSince}>
              {t("profile.member_since", { date: memberSince })}
            </Text>
          ) : null}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{historyCount}</Text>
            <Text style={styles.statLabel}>{t("profile.history")}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{savedCount}</Text>
            <Text style={styles.statLabel}>{t("profile.saved_equipment")}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("profile.language")}</Text>
            <LanguageToggle />
          </View>

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push("/feedback")}
          >
            <Text style={styles.rowLabel}>{t("profile.feedback")}</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, styles.danger]} onPress={handleSignOut}>
            <Text style={styles.dangerText}>{t("auth.logout")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  guest: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  guestEmoji: { fontSize: 48, marginBottom: 16 },
  guestTitle: { color: "#F5F5F5", fontSize: 24, fontWeight: "800", marginBottom: 12 },
  guestSubtitle: { color: "#888888", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  signUpButton: {
    backgroundColor: "#E8FF47", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14,
    width: "100%", alignItems: "center", marginBottom: 12,
  },
  signUpText: { color: "#0A0A0A", fontSize: 16, fontWeight: "800" },
  loginButton: { alignItems: "center", paddingVertical: 12 },
  loginText: { color: "#888888", fontSize: 14 },
  hero: { alignItems: "center", paddingTop: 32, paddingBottom: 24, paddingHorizontal: 20 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#E8FF47", alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  avatarText: { color: "#0A0A0A", fontSize: 32, fontWeight: "800" },
  username: { color: "#F5F5F5", fontSize: 20, fontWeight: "700" },
  memberSince: { color: "#888888", fontSize: 13, marginTop: 4 },
  stats: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141414", borderRadius: 16, marginHorizontal: 16,
    marginBottom: 24, paddingVertical: 20, borderWidth: 1, borderColor: "#2A2A2A",
  },
  stat: { flex: 1, alignItems: "center" },
  statNumber: { color: "#E8FF47", fontSize: 28, fontWeight: "800" },
  statLabel: { color: "#888888", fontSize: 12, marginTop: 4, textAlign: "center" },
  statDivider: { width: 1, height: 40, backgroundColor: "#2A2A2A" },
  section: {
    backgroundColor: "#141414", borderRadius: 16, marginHorizontal: 16,
    marginBottom: 40, borderWidth: 1, borderColor: "#2A2A2A", overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "#2A2A2A",
  },
  rowLabel: { color: "#F5F5F5", fontSize: 15 },
  rowArrow: { color: "#888888", fontSize: 20 },
  danger: { borderBottomWidth: 0 },
  dangerText: { color: "#FF4747", fontSize: 15, fontWeight: "600" },
});

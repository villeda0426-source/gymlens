import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import SafeScreen from "@/components/Layout/SafeScreen";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import LanguageToggle from "@/components/UI/LanguageToggle";
import { colors, fonts } from "@/constants/theme";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, profile, signOut, updateProfileName } = useAuthStore();
  const [historyCount, setHistoryCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [name, setName] = useState(profile?.username || "");
  const [editingName, setEditingName] = useState(!profile?.username);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("equipment_identifications").select("id", { count: "exact" }).eq("user_id", user.id)
      .then(({ count }) => setHistoryCount(count || 0));
    supabase.from("saved_equipment").select("id", { count: "exact" }).eq("user_id", user.id)
      .then(({ count }) => setSavedCount(count || 0));
  }, [user]);

  useEffect(() => {
    setName(profile?.username || "");
    setEditingName(!profile?.username);
  }, [profile?.username]);

  const handleSaveName = async () => {
    setSavingName(true);
    const result = await updateProfileName(name);
    setSavingName(false);
    if (result.error) {
      Alert.alert("Could not save name", result.error);
      return;
    }
    setEditingName(false);
  };

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
  const displayName = profile?.username || "Add your name";

  return (
    <SafeScreen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile?.username || user.email || "?")[0].toUpperCase()}
            </Text>
          </View>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.email}>{user.email}</Text>
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
          <View style={styles.profileRow}>
            <View style={styles.profileRowHeader}>
              <View>
                <Text style={styles.rowOverline}>Display name</Text>
                <Text style={styles.rowHint}>Used for greetings and your profile.</Text>
              </View>
              {!editingName && (
                <TouchableOpacity onPress={() => setEditingName(true)} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={20} color={colors.coral} />
                </TouchableOpacity>
              )}
            </View>
            {editingName ? (
              <View style={styles.nameEditor}>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity
                  style={[styles.saveNameButton, savingName && styles.saveNameButtonDisabled]}
                  onPress={handleSaveName}
                  disabled={savingName}
                >
                  {savingName ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveNameText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.accountCard}>
            <Ionicons name="folder-open-outline" size={21} color={colors.coral} />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountTitle}>Account folder</Text>
              <Text style={styles.accountText}>
                Scans and saved equipment are stored under your signed-in account.
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("profile.language")}</Text>
            <LanguageToggle />
          </View>

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
  guestTitle: { color: colors.text, fontSize: 24, fontFamily: fonts.heading, marginBottom: 12 },
  guestSubtitle: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  signUpButton: {
    backgroundColor: colors.coral, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14,
    width: "100%", alignItems: "center", marginBottom: 12,
  },
  signUpText: { color: colors.white, fontSize: 16, fontFamily: fonts.extraBold },
  loginButton: { alignItems: "center", paddingVertical: 12 },
  loginText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.body },
  hero: { alignItems: "center", paddingTop: 32, paddingBottom: 24, paddingHorizontal: 20 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.coral, alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  avatarText: { color: colors.white, fontSize: 32, fontFamily: fonts.extraBold },
  username: { color: colors.text, fontSize: 20, fontFamily: fonts.bold },
  email: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body, marginTop: 3 },
  memberSince: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body, marginTop: 4 },
  stats: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: 16, marginHorizontal: 16,
    marginBottom: 24, paddingVertical: 20, borderWidth: 1, borderColor: colors.cardBorder,
  },
  stat: { flex: 1, alignItems: "center" },
  statNumber: { color: colors.coral, fontSize: 28, fontFamily: fonts.extraBold },
  statLabel: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 4, textAlign: "center" },
  statDivider: { width: 1, height: 40, backgroundColor: colors.cardBorder },
  section: {
    backgroundColor: colors.card, borderRadius: 16, marginHorizontal: 16,
    marginBottom: 40, borderWidth: 1, borderColor: colors.cardBorder, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  profileRow: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, gap: 12 },
  profileRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  rowOverline: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
  rowHint: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body, marginTop: 3 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.coral + "14" },
  nameEditor: { flexDirection: "row", gap: 10, alignItems: "center" },
  nameInput: {
    flex: 1,
    backgroundColor: colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveNameButton: { minWidth: 74, height: 46, borderRadius: 10, backgroundColor: colors.coral, alignItems: "center", justifyContent: "center" },
  saveNameButtonDisabled: { opacity: 0.7 },
  saveNameText: { color: colors.white, fontSize: 14, fontFamily: fonts.bold },
  accountCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.coral + "0d",
    borderWidth: 1,
    borderColor: colors.coral + "26",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  accountTitle: { color: colors.text, fontSize: 14, fontFamily: fonts.bold, marginBottom: 2 },
  accountText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.body, lineHeight: 17 },
  rowLabel: { color: colors.text, fontSize: 15, fontFamily: fonts.body },
  danger: { borderBottomWidth: 0 },
  dangerText: { color: colors.danger, fontSize: 15, fontFamily: fonts.semiBold },
});

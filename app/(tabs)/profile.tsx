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
import LanguageToggle from "@/components/UI/LanguageToggle";
import { colors, fonts } from "@/constants/theme";

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, profile, signOut, updateProfileName } = useAuthStore();
  const [name, setName] = useState(profile?.username || "");
  const [editingName, setEditingName] = useState(!profile?.username);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setName(profile?.username || "");
    setEditingName(!profile?.username);
  }, [profile?.username]);

  const handleSaveName = async () => {
    setSavingName(true);
    const result = await updateProfileName(name);
    setSavingName(false);
    if (result.error) {
      Alert.alert(t("profile.save_name_error"), result.error);
      return;
    }
    setEditingName(false);
  };

  const handleSignOut = () => {
    Alert.alert(t("auth.logout"), t("profile.sign_out_confirm"), [
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
    ? new Date(profile.created_at).toLocaleDateString(i18n.language?.startsWith("es") ? "es-US" : "en-US", { month: "long", year: "numeric" })
    : "";
  const displayName = profile?.username || t("profile.add_name");

  return (
    <SafeScreen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile?.username || user.email || "?")[0].toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {memberSince ? (
            <Text style={styles.memberSince}>
              {t("profile.member_since", { date: memberSince })}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.profileRow}>
            <View style={styles.profileRowHeader}>
              <View>
                <Text style={styles.rowOverline}>{t("profile.display_name")}</Text>
                <Text style={styles.rowHint}>{t("profile.display_name_hint")}</Text>
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
                  placeholder={t("profile.your_name")}
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
                    <Text style={styles.saveNameText}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.row}>
            <View style={styles.rowLead}>
              <View style={styles.rowIcon}>
                <Ionicons name="language-outline" size={19} color={colors.coral} />
              </View>
              <Text style={styles.rowLabel}>{t("profile.language")}</Text>
            </View>
            <LanguageToggle />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.dangerText}>{t("auth.logout")}</Text>
        </TouchableOpacity>
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
  heroCard: {
    alignItems: "center", paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20,
    marginHorizontal: 16, marginTop: 16, marginBottom: 16, borderRadius: 24,
    backgroundColor: colors.coral + "0d", borderWidth: 1, borderColor: colors.coral + "24",
  },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.coral + "1f", marginBottom: 15,
  },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.coral, alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: 32, fontFamily: fonts.extraBold },
  username: { color: colors.text, fontSize: 20, fontFamily: fonts.bold },
  email: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body, marginTop: 3 },
  memberSince: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.body, marginTop: 4 },
  section: {
    backgroundColor: colors.card, borderRadius: 16, marginHorizontal: 16,
    borderWidth: 1, borderColor: colors.cardBorder, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.cardBorder,
  },
  rowLead: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.coral + "14",
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
  rowLabel: { color: colors.text, fontSize: 15, fontFamily: fonts.body },
  logoutButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
    marginHorizontal: 16, marginTop: 14, marginBottom: 40, paddingVertical: 16,
    backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.danger + "35",
  },
  dangerText: { color: colors.danger, fontSize: 15, fontFamily: fonts.semiBold },
});

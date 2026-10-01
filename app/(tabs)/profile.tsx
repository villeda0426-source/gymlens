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
import { coachColors, coachFonts } from "@/constants/theme";

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, profile, signOut, updateProfileName, deleteAccount } = useAuthStore();
  const [name, setName] = useState(profile?.username || "");
  const [editingName, setEditingName] = useState(!profile?.username);
  const [savingName, setSavingName] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

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

  const handleDeleteAccount = () => {
    Alert.alert(t("profile.delete_account"), t("profile.delete_account_confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.delete_account_action"),
        style: "destructive",
        onPress: async () => {
          setDeletingAccount(true);
          const result = await deleteAccount();
          setDeletingAccount(false);
          if (result.error) Alert.alert(t("profile.delete_account_error"), result.error);
        },
      },
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

        {/* Grouped section, per standard settings-page convention (QA #18):
            a labeled header over a bordered card, instead of loose rows. */}
        <Text style={styles.sectionLabel}>{t("profile.settings")}</Text>
        <View style={styles.section}>
          <View style={styles.profileRow}>
            <View style={styles.profileRowHeader}>
              <View>
                <Text style={styles.rowOverline}>{t("profile.display_name")}</Text>
                <Text style={styles.rowHint}>{t("profile.display_name_hint")}</Text>
              </View>
              {!editingName && (
                <TouchableOpacity onPress={() => setEditingName(true)} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={20} color={coachColors.coral} />
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
                  placeholderTextColor={coachColors.textSecondary}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <TouchableOpacity
                  style={[styles.saveNameButton, savingName && styles.buttonDisabled]}
                  onPress={handleSaveName}
                  disabled={savingName}
                >
                  {savingName ? (
                    <ActivityIndicator color={coachColors.card} />
                  ) : (
                    <Text style={styles.saveNameText}>{t("common.save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.rowLead}>
              <View style={styles.rowIcon}>
                <Ionicons name="language-outline" size={19} color={coachColors.coral} />
              </View>
              <Text style={styles.rowLabel}>{t("profile.language")}</Text>
            </View>
            <LanguageToggle />
          </View>
        </View>

        {/* Destructive actions, visually separated and last (QA #18): Log Out
            moved below the settings group instead of sitting right after it;
            Delete Account de-emphasized further still, below Log Out, as a
            plain link rather than its own bordered card+button — still
            behind the same confirmation dialog, just no longer the kind of
            prominent one-tap target a bordered destructive button reads as. */}
        <View style={styles.dangerZone}>
          <TouchableOpacity style={styles.logoutRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={19} color={coachColors.text} />
            <Text style={styles.logoutText}>{t("auth.logout")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteLink}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? (
              <ActivityIndicator color={coachColors.coral} size="small" />
            ) : (
              <Text style={styles.deleteLinkText}>{t("profile.delete_account_action")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  guest: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  guestEmoji: { fontSize: 48, marginBottom: 16 },
  guestTitle: { color: coachColors.text, fontSize: 24, fontFamily: coachFonts.heading, marginBottom: 12 },
  guestSubtitle: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  signUpButton: {
    backgroundColor: coachColors.coral, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14,
    width: "100%", alignItems: "center", marginBottom: 12,
  },
  signUpText: { color: coachColors.card, fontSize: 16, fontFamily: coachFonts.bodyExtraBold },
  loginButton: { alignItems: "center", paddingVertical: 12 },
  loginText: { color: coachColors.textSecondary, fontSize: 14, fontFamily: coachFonts.body },
  heroCard: {
    alignItems: "center", paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20,
    marginHorizontal: 16, marginTop: 16, marginBottom: 20, borderRadius: 24,
    backgroundColor: coachColors.card, borderWidth: 1, borderColor: coachColors.border,
  },
  avatarRing: {
    width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center",
    backgroundColor: coachColors.bg, marginBottom: 15,
  },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: coachColors.coral, alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: coachColors.card, fontSize: 32, fontFamily: coachFonts.bodyExtraBold },
  username: { color: coachColors.text, fontSize: 20, fontFamily: coachFonts.headingSemiBold },
  email: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body, marginTop: 3 },
  memberSince: { color: coachColors.textSecondary, fontSize: 13, fontFamily: coachFonts.body, marginTop: 4 },
  sectionLabel: {
    color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.bodyExtraBold,
    letterSpacing: 1, textTransform: "uppercase",
    marginHorizontal: 20, marginBottom: 8,
  },
  section: {
    backgroundColor: coachColors.card, borderRadius: 16, marginHorizontal: 16,
    borderWidth: 1, borderColor: coachColors.border, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: coachColors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLead: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: coachColors.bg,
  },
  profileRow: { paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: coachColors.border, gap: 12 },
  profileRowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  rowOverline: { color: coachColors.text, fontSize: 15, fontFamily: coachFonts.bodyBold },
  rowHint: { color: coachColors.textSecondary, fontSize: 12, fontFamily: coachFonts.body, marginTop: 3 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: coachColors.bg },
  nameEditor: { flexDirection: "row", gap: 10, alignItems: "center" },
  nameInput: {
    flex: 1,
    backgroundColor: coachColors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: coachColors.border,
    color: coachColors.text,
    fontSize: 15,
    fontFamily: coachFonts.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveNameButton: { minWidth: 74, height: 46, borderRadius: 10, backgroundColor: coachColors.coralPressed, alignItems: "center", justifyContent: "center" },
  buttonDisabled: { opacity: 0.7 },
  saveNameText: { color: coachColors.card, fontSize: 14, fontFamily: coachFonts.bodyBold },
  rowLabel: { color: coachColors.text, fontSize: 15, fontFamily: coachFonts.body },
  dangerZone: { marginHorizontal: 16, marginTop: 28, marginBottom: 40, gap: 4 },
  logoutRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: coachColors.card, borderWidth: 1, borderColor: coachColors.border,
  },
  logoutText: { color: coachColors.text, fontSize: 15, fontFamily: coachFonts.bodySemiBold },
  deleteLink: { alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  deleteLinkText: { color: coachColors.coral, fontSize: 13, fontFamily: coachFonts.bodySemiBold },
});

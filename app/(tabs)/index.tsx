import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/authStore";
import EquipmentCard from "@/components/Equipment/EquipmentCard";
import { colors, fonts } from "@/constants/theme";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";

function getGreeting(t: (key: string) => string, name?: string): string {
  const hour = new Date().getHours();
  const baseKey = hour < 12 ? "home.good_morning" : hour < 17 ? "home.good_afternoon" : "home.good_evening";
  const base = t(baseKey);
  return name ? `${base}, ${name.split(" ")[0]} 👋` : `${base} 👋`;
}

function getTodaysTip(t: (key: string) => string): string {
  return t(`home.tips.${new Date().getDay()}`);
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile } = useAuthStore();
  const [featuredItem, setFeaturedItem] = useState<any>(null);
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  useEffect(() => {
    fetchFeatured();
  }, []);

  const fetchFeatured = async () => {
    setLoadingFeatured(true);
    try {
      const res = await fetch(`${API_BASE}/api/search`);
      const data = await res.json();
      if (data && data.length > 0) {
        const idx = Math.floor(Math.random() * data.length);
        setFeaturedItem(data[idx]);
      }
    } finally {
      setLoadingFeatured(false);
    }
  };

  const displayName = profile?.username || undefined;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting(t, displayName)}</Text>
          <View style={styles.logoRow}>
            <Image
              source={require("@/assets/images/coachlift-logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.logo}>
              Coach<Text style={styles.logoAccent}>lift</Text>
            </Text>
          </View>
        </View>

        {/* Identify Equipment CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.88}
          onPress={() => router.push("/(tabs)/scan")}
        >
          <View style={styles.ctaIcon}>
            <Ionicons name="scan" size={28} color={colors.white} />
          </View>
          <View style={styles.ctaText}>
            <Text style={styles.ctaTitle}>{t("home.identify_equipment")}</Text>
            <Text style={styles.ctaSubtitle}>{t("home.identify_subtitle")}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.white} style={{ opacity: 0.7 }} />
        </TouchableOpacity>

        {/* Featured equipment */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("home.spotlight")}</Text>
            <TouchableOpacity onPress={fetchFeatured}>
              <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loadingFeatured ? (
            <View style={styles.cardLoading}>
              <ActivityIndicator color={colors.coral} />
            </View>
          ) : featuredItem ? (
            <EquipmentCard item={featuredItem} />
          ) : (
            <View style={styles.cardLoading}>
              <Text style={styles.noData}>{t("search.no_results")}</Text>
            </View>
          )}
        </View>

        {/* Today's Tip */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <View style={styles.tipBadge}>
              <Text style={styles.tipBadgeText}>{t("home.todays_tip")}</Text>
            </View>
            <Ionicons name="bulb-outline" size={20} color={colors.lime} />
          </View>
          <Text style={styles.tipText}>{getTodaysTip(t)}</Text>
        </View>

        {/* Quick links */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/search")}
            activeOpacity={0.85}
          >
            <Ionicons name="search" size={22} color={colors.coral} />
            <Text style={styles.quickLabel}>{t("home.browse_equipment")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/saved")}
            activeOpacity={0.85}
          >
            <Ionicons name="bookmark" size={22} color={colors.coral} />
            <Text style={styles.quickLabel}>{t("home.saved_items")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={() => router.push("/(tabs)/profile")}
            activeOpacity={0.85}
          >
            <Ionicons name="person" size={22} color={colors.coral} />
            <Text style={styles.quickLabel}>{t("home.my_profile")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 32 },

  header: { paddingTop: 12, paddingBottom: 20 },
  greeting: { fontSize: 14, fontFamily: fonts.body, color: colors.textSecondary, marginBottom: 6 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoImage: { height: 40, width: undefined },
  logo: { fontSize: 32, fontFamily: fonts.heading, color: colors.text },
  logoAccent: { color: colors.coral },

  ctaButton: {
    backgroundColor: colors.coral,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 28,
    shadowColor: colors.coral,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  ctaIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { flex: 1 },
  ctaTitle: { color: colors.white, fontSize: 17, fontFamily: fonts.bold },
  ctaSubtitle: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: fonts.body, marginTop: 2 },

  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  cardLoading: {
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  noData: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },

  tipCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 24,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  tipBadge: {
    backgroundColor: colors.lime + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.lime + "40",
  },
  tipBadgeText: { color: colors.lime, fontSize: 11, fontFamily: fonts.bold },
  tipText: { color: colors.text, fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },

  quickRow: { flexDirection: "row", gap: 12 },
  quickCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  quickLabel: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.semiBold,
    textAlign: "center",
    lineHeight: 16,
  },
});

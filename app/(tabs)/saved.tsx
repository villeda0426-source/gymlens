import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import SafeScreen from "@/components/Layout/SafeScreen";
import EquipmentCard from "@/components/Equipment/EquipmentCard";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useEquipmentStore } from "@/store/equipmentStore";

const CATEGORIES = ["all", "machine", "free_weight", "cable", "cardio", "accessory"] as const;

export default function SavedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const { guestSavedItems, loadSavedIds } = useEquipmentStore();
  // Mirror the same gate as the detail screen
  const authenticatedUserId = user && profile ? user.id : null;

  const [userSaved, setUserSaved] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    if (authenticatedUserId) {
      const { data, error } = await supabase
        .from("saved_equipment")
        .select("equipment:equipment_id(*)")
        .eq("user_id", authenticatedUserId)
        .order("saved_at", { ascending: false });
      if (!error) {
        setUserSaved((data || []).map((d: any) => d.equipment).filter(Boolean));
      }
    } else {
      await loadSavedIds(null);
    }
    setIsLoading(false);
  }, [authenticatedUserId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const allItems = authenticatedUserId ? userSaved : guestSavedItems;
  const filtered =
    activeCategory === "all"
      ? allItems
      : allItems.filter((e) => e.category === activeCategory);

  return (
    <SafeScreen edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("saved.title")}</Text>
      </View>

      {/* Sign-in nudge for guests */}
      {!authenticatedUserId && (
        <TouchableOpacity
          onPress={() => router.push("/(auth)/login")}
          style={styles.syncBanner}
        >
          <Text style={styles.syncBannerText}>
            Sign in to sync saved items across devices
          </Text>
          <Text style={styles.syncBannerCta}>Sign In →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.filters}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setActiveCategory(cat)}
            style={[styles.chip, activeCategory === cat && styles.chipActive]}
          >
            <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>
              {t(`equipment.categories.${cat}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#E8FF47" size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔖</Text>
          <Text style={styles.emptyTitle}>
            {activeCategory !== "all" ? "No items in this category" : t("saved.empty")}
          </Text>
          <Text style={styles.emptySubtitle}>{t("saved.empty_subtitle")}</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.cta}>
            <Text style={styles.ctaText}>{t("saved.start_scanning")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EquipmentCard item={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8FF47" />
          }
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>
              {filtered.length} item{filtered.length !== 1 ? "s" : ""}
            </Text>
          }
        />
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: "#F5F5F5", fontSize: 28, fontWeight: "800" },
  syncBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#141414",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  syncBannerText: { color: "#888888", fontSize: 12, flex: 1, marginRight: 8 },
  syncBannerCta: { color: "#E8FF47", fontSize: 12, fontWeight: "700" },
  filters: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#141414",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  chipActive: { backgroundColor: "#E8FF47", borderColor: "#E8FF47" },
  chipText: { color: "#888888", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#0A0A0A" },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  count: { color: "#888888", fontSize: 12, marginBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: "#F5F5F5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: {
    color: "#888888",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  cta: {
    backgroundColor: "#E8FF47",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  ctaText: { color: "#0A0A0A", fontSize: 14, fontWeight: "700" },
});

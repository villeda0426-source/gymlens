import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import EquipmentCard from "@/components/Equipment/EquipmentCard";
import SafeScreen from "@/components/Layout/SafeScreen";
import { useEquipmentSearch } from "@/hooks/useEquipmentSearch";

const CATEGORIES = ["all", "machine", "free_weight", "cable", "cardio", "accessory"] as const;

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const { search, results, isLoading, error } = useEquipmentSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query, activeCategory);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeCategory]);

  return (
    <SafeScreen edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("tabs.search")}</Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder={t("search.placeholder")}
          placeholderTextColor="#888888"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

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
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>⚠️</Text>
          <Text style={styles.emptyTitle}>Could not reach server</Text>
          <Text style={styles.emptySubtitle}>
            Make sure the CoachLift server is running and your device is on the same network.
          </Text>
          <TouchableOpacity onPress={() => search(query, activeCategory)} style={styles.cameraButton}>
            <Text style={styles.cameraButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{query ? "🤷" : "🏋️"}</Text>
          <Text style={styles.emptyTitle}>
            {query ? t("search.no_results") : "No equipment yet"}
          </Text>
          <Text style={styles.emptySubtitle}>
            {query
              ? t("search.no_results_subtitle")
              : "Scan gym equipment with the camera to identify and save it here."}
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)")} style={styles.cameraButton}>
            <Text style={styles.cameraButtonText}>{t("search.try_camera")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EquipmentCard item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            results.length > 0 ? (
              <Text style={styles.resultCount}>
                {t("search.results_count", { count: results.length })}
              </Text>
            ) : null
          }
        />
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { color: "#F5F5F5", fontSize: 28, fontWeight: "800" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 12,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    height: 48,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  input: { flex: 1, color: "#F5F5F5", fontSize: 15 },
  clearIcon: { color: "#888888", fontSize: 16, padding: 4 },
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
  resultCount: { color: "#888888", fontSize: 12, marginBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: "#F5F5F5", fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: { color: "#888888", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  cameraButton: {
    backgroundColor: "#E8FF47",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  cameraButtonText: { color: "#0A0A0A", fontSize: 14, fontWeight: "700" },
});

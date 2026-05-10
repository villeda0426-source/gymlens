import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_SAVED_KEY = "coachlift_guest_saved";

interface EquipmentResult {
  id?: string;
  name: string;
  name_es: string;
  category: string;
  confidence: number;
  description: string;
  description_es: string;
  muscle_groups: string[];
  tutorial_steps: Array<{ step: number; instruction: string; instruction_es: string }>;
  safety_tips: string[];
  safety_tips_es: string[];
  difficulty: string;
  image_url?: string;
  videos?: Array<{
    youtube_id: string;
    title: string;
    thumbnail_url: string;
    duration: string;
    curator_approved?: boolean;
  }>;
  identification_id?: string;
}

interface EquipmentStore {
  currentResult: EquipmentResult | null;
  recentlyViewed: EquipmentResult[];
  savedIds: string[];
  guestSavedItems: any[];
  setCurrentResult: (result: EquipmentResult | null) => void;
  addToRecentlyViewed: (item: EquipmentResult) => void;
  loadSavedIds: (userId: string | null) => Promise<void>;
  toggleSave: (equipment: any, userId: string | null) => Promise<"saved" | "removed" | "error">;
  isSaved: (equipmentId: string) => boolean;
}

export const useEquipmentStore = create<EquipmentStore>((set, get) => ({
  currentResult: null,
  recentlyViewed: [],
  savedIds: [],
  guestSavedItems: [],

  setCurrentResult: (result) => set({ currentResult: result }),

  addToRecentlyViewed: (item) => {
    const current = get().recentlyViewed;
    const filtered = current.filter((r) => r.name !== item.name);
    set({ recentlyViewed: [item, ...filtered].slice(0, 20) });
  },

  loadSavedIds: async (userId) => {
    if (userId) {
      const { data, error } = await supabase
        .from("saved_equipment")
        .select("equipment_id")
        .eq("user_id", userId);
      if (!error) {
        set({ savedIds: (data || []).map((r: any) => r.equipment_id) });
      }
    } else {
      const stored = await AsyncStorage.getItem(GUEST_SAVED_KEY);
      const items: any[] = stored ? JSON.parse(stored) : [];
      set({ savedIds: items.map((i) => i.id).filter(Boolean), guestSavedItems: items });
    }
  },

  toggleSave: async (equipment, userId): Promise<"saved" | "removed" | "error"> => {
    const equipmentId = typeof equipment === "string" ? equipment : equipment?.id;
    if (!equipmentId) return "error";

    const { savedIds } = get();
    const alreadySaved = savedIds.includes(equipmentId);

    if (userId) {
      if (alreadySaved) {
        const { error } = await supabase
          .from("saved_equipment")
          .delete()
          .eq("user_id", userId)
          .eq("equipment_id", equipmentId);
        if (error) {
          console.error("[toggleSave] delete error:", error.message);
          return "error";
        }
        set({ savedIds: savedIds.filter((id) => id !== equipmentId) });
        return "removed";
      } else {
        const { error } = await supabase
          .from("saved_equipment")
          .insert({ user_id: userId, equipment_id: equipmentId });
        if (error) {
          console.error("[toggleSave] insert error:", error.message, error.details, error.hint);
          return "error";
        }
        set({ savedIds: [...savedIds, equipmentId] });
        return "saved";
      }
    } else {
      // Guest: AsyncStorage with full equipment object
      const stored = await AsyncStorage.getItem(GUEST_SAVED_KEY);
      const items: any[] = stored ? JSON.parse(stored) : [];
      if (alreadySaved) {
        const updated = items.filter((i) => i.id !== equipmentId);
        await AsyncStorage.setItem(GUEST_SAVED_KEY, JSON.stringify(updated));
        set({ savedIds: savedIds.filter((id) => id !== equipmentId), guestSavedItems: updated });
        return "removed";
      } else {
        const equipObj = typeof equipment === "string" ? { id: equipment } : equipment;
        const updated = [equipObj, ...items];
        await AsyncStorage.setItem(GUEST_SAVED_KEY, JSON.stringify(updated));
        set({ savedIds: [...savedIds, equipmentId], guestSavedItems: updated });
        return "saved";
      }
    }
  },

  isSaved: (equipmentId) => get().savedIds.includes(equipmentId),
}));

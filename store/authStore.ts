import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { apiFetch } from "@/lib/api";

const GUEST_USES_KEY = "coachlift_guest_uses";
const MAX_GUEST_USES = 3;

interface AuthState {
  user: any | null;
  profile: any | null;
  isLoading: boolean;
  isGuest: boolean;
  guestUses: number;
  setUser: (user: any | null) => void;
  setProfile: (profile: any | null) => void;
  loadProfile: () => Promise<void>;
  updateProfileName: (name: string) => Promise<{ error?: string }>;
  incrementGuestUses: () => Promise<void>;
  canUseAsGuest: () => boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isGuest: false,
  guestUses: 0,

  setUser: (user) => set({ user, isGuest: !user }),

  setProfile: (profile) => set({ profile }),

  loadProfile: async () => {
    const { user } = get();
    if (!user) {
      const stored = await AsyncStorage.getItem(GUEST_USES_KEY);
      set({ profile: null, guestUses: stored ? parseInt(stored) : 0, isLoading: false });
      return;
    }
    const fallbackName =
      user.user_metadata?.username ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      "";
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      set({ profile: data, isLoading: false });
      return;
    }

    if (error) {
      console.warn("[loadProfile] profile fetch error:", error.message);
    }

    set({ profile: { id: user.id, username: fallbackName || null }, isLoading: false });
  },

  updateProfileName: async (name) => {
    const { user, profile } = get();
    const cleanName = name.trim();
    if (!user) return { error: "You need to be signed in." };
    if (!cleanName) return { error: "Name cannot be empty." };

    const { error } = await supabase
      .from("profiles")
      .update({ username: cleanName, language: profile?.language || "en" })
      .eq("id", user.id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn("[updateProfileName] profile update error:", error.message);
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { username: cleanName, full_name: cleanName },
    });
    if (authError) {
      console.warn("[updateProfileName] auth metadata update error:", authError.message);
    }

    set({ profile: { ...(profile || { id: user.id }), username: cleanName } });
    return {};
  },

  incrementGuestUses: async () => {
    const current = get().guestUses + 1;
    set({ guestUses: current });
    await AsyncStorage.setItem(GUEST_USES_KEY, String(current));
  },

  canUseAsGuest: () => {
    const { user, guestUses } = get();
    return !!user || guestUses < MAX_GUEST_USES;
  },

  signOut: async () => {
    useCoachTrainerStore.getState().resetChatSession();
    await supabase.auth.signOut();
    set({ user: null, profile: null, isGuest: true });
  },

  deleteAccount: async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { error: "Your session is no longer valid. Please sign in again." };

    try {
      await apiFetch<{ deleted: boolean }>("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }, 30_000);
      await useCoachTrainerStore.getState().purgeTrainer();
      await AsyncStorage.removeItem(GUEST_USES_KEY);
      await supabase.auth.signOut({ scope: "local" });
      set({ user: null, profile: null, isGuest: true, guestUses: 0 });
      return {};
    } catch (error: any) {
      return { error: error?.message || "Account deletion failed." };
    }
  },
}));

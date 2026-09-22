import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCoachTrainerStore } from "@/store/coachTrainerStore";
import { apiFetch } from "@/lib/api";

const GUEST_USES_KEY = "coachlift_guest_uses";
const GUEST_ACCESS_KEY = "coachlift_guest_access_enabled";
const MAX_GUEST_USES = 3;

interface AuthState {
  user: any | null;
  profile: any | null;
  isLoading: boolean;
  isGuest: boolean;
  guestAccessEnabled: boolean;
  guestUses: number;
  setUser: (user: any | null) => void;
  setProfile: (profile: any | null) => void;
  loadProfile: () => Promise<void>;
  updateProfileName: (name: string) => Promise<{ error?: string }>;
  incrementGuestUses: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  canUseAsGuest: () => boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error?: string }>;
  exportAccountData: () => Promise<{ data?: unknown; error?: string }>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  isLoading: true,
  isGuest: false,
  guestAccessEnabled: false,
  guestUses: 0,

  setUser: (user) => {
    const currentUserId = get().user?.id ?? null;
    const nextUserId = user?.id ?? null;
    if (currentUserId !== nextUserId) {
      // Coach state is scoped before a different account can render it.
      void useCoachTrainerStore.getState().setStorageScope(nextUserId);
    }
    set({ user, isGuest: !user });
  },

  setProfile: (profile) => set({ profile }),

  loadProfile: async () => {
    const { user } = get();
    if (!user) {
      const [stored, guestAccess] = await Promise.all([
        AsyncStorage.getItem(GUEST_USES_KEY),
        AsyncStorage.getItem(GUEST_ACCESS_KEY),
      ]);
      set({
        profile: null,
        guestUses: stored ? parseInt(stored) : 0,
        guestAccessEnabled: guestAccess === "true",
        isLoading: false,
      });
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

    set({
      profile: {
        id: user.id,
        // Keep the legacy fields while the additive account migration rolls out.
        username: fallbackName || null,
        display_name: fallbackName || null,
        language: "en",
        preferred_language: "en",
      },
      isLoading: false,
    });
  },

  updateProfileName: async (name) => {
    const { user, profile } = get();
    const cleanName = name.trim();
    if (!user) return { error: "You need to be signed in." };
    if (!cleanName) return { error: "Name cannot be empty." };

    const preferredLanguage = profile?.preferred_language || profile?.language || "en";
    const modernUpdate = {
      username: cleanName,
      display_name: cleanName,
      language: preferredLanguage,
      preferred_language: preferredLanguage,
    };
    let { error } = await supabase
      .from("profiles")
      .update(modernUpdate)
      .eq("id", user.id)
      .select("*")
      .maybeSingle();

    // Older installations may reach the app before the additive migration is
    // applied. Continue updating the legacy columns rather than failing a name
    // edit because a new optional column is not present yet.
    if (error) {
      ({ error } = await supabase
        .from("profiles")
        .update({ username: cleanName, language: preferredLanguage })
        .eq("id", user.id)
        .select("*")
        .maybeSingle());
    }

    if (error) {
      console.warn("[updateProfileName] profile update error:", error.message);
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: { username: cleanName, full_name: cleanName },
    });
    if (authError) {
      console.warn("[updateProfileName] auth metadata update error:", authError.message);
    }

    set({
      profile: {
        ...(profile || { id: user.id }),
        username: cleanName,
        display_name: cleanName,
        language: preferredLanguage,
        preferred_language: preferredLanguage,
      },
    });
    return {};
  },

  incrementGuestUses: async () => {
    const current = get().guestUses + 1;
    set({ guestUses: current });
    await AsyncStorage.setItem(GUEST_USES_KEY, String(current));
  },

  continueAsGuest: async () => {
    await AsyncStorage.setItem(GUEST_ACCESS_KEY, "true");
    void useCoachTrainerStore.getState().setStorageScope(null);
    set({ user: null, profile: null, isGuest: true, guestAccessEnabled: true, isLoading: false });
  },

  canUseAsGuest: () => {
    const { user, guestUses } = get();
    return !!user || guestUses < MAX_GUEST_USES;
  },

  signOut: async () => {
    useCoachTrainerStore.getState().clearTrainer();
    await supabase.auth.signOut();
    await AsyncStorage.removeItem(GUEST_ACCESS_KEY);
    get().setUser(null);
    set({ profile: null, isGuest: true, guestAccessEnabled: false });
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
      useCoachTrainerStore.getState().clearTrainer();
      await AsyncStorage.removeItem(GUEST_USES_KEY);
      await AsyncStorage.removeItem(GUEST_ACCESS_KEY);
      await supabase.auth.signOut({ scope: "local" });
      get().setUser(null);
      set({ profile: null, isGuest: true, guestAccessEnabled: false, guestUses: 0 });
      return {};
    } catch (error: any) {
      return { error: error?.message || "Could not delete your account. Please try again." };
    }
  },

  exportAccountData: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return { error: "Your session is no longer valid. Please sign in again." };

    try {
      const exportData = await apiFetch<unknown>("/api/account/export", {
        headers: { Authorization: `Bearer ${token}` },
      }, 30_000);
      return { data: exportData };
    } catch (error: any) {
      return { error: error?.message || "Could not export your account data. Please try again." };
    }
  },
}));

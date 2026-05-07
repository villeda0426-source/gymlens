import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_USES_KEY = "gymlens_guest_uses";
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
  incrementGuestUses: () => Promise<void>;
  canUseAsGuest: () => boolean;
  signOut: () => Promise<void>;
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
      set({ guestUses: stored ? parseInt(stored) : 0, isLoading: false });
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    set({ profile: data, isLoading: false });
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
    await supabase.auth.signOut();
    set({ user: null, profile: null, isGuest: true });
  },
}));

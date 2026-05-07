import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const { user, profile, isLoading, isGuest, guestUses, setUser, loadProfile, signOut, canUseAsGuest, incrementGuestUses } =
    useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      loadProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      loadProfile();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, isLoading, isGuest, guestUses, signOut, canUseAsGuest, incrementGuestUses };
}

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          language: string;
          guest_uses: number;
          created_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          language?: string;
          guest_uses?: number;
        };
        Update: {
          username?: string | null;
          language?: string;
          guest_uses?: number;
        };
      };
      equipment: {
        Row: {
          id: string;
          name: string;
          name_es: string | null;
          category: string | null;
          description: string | null;
          description_es: string | null;
          muscle_groups: string[] | null;
          difficulty: string | null;
          tutorial_steps: any | null;
          safety_tips: string[] | null;
          safety_tips_es: string[] | null;
          image_url: string | null;
          created_at: string;
        };
      };
      equipment_identifications: {
        Row: {
          id: string;
          user_id: string | null;
          equipment_id: string | null;
          image_url: string | null;
          raw_result: any;
          confidence: number | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          equipment_id?: string | null;
          image_url?: string | null;
          raw_result: any;
          confidence?: number | null;
        };
      };
      saved_equipment: {
        Row: {
          id: string;
          user_id: string;
          equipment_id: string;
          saved_at: string;
        };
        Insert: {
          user_id: string;
          equipment_id: string;
        };
      };
      equipment_videos: {
        Row: {
          id: string;
          equipment_id: string;
          youtube_id: string;
          title: string | null;
          thumbnail_url: string | null;
          duration: string | null;
          language: string;
          curator_approved: boolean;
        };
      };
      feedback: {
        Row: {
          id: string;
          user_id: string | null;
          identification_id: string | null;
          rating: number | null;
          category: string | null;
          message: string | null;
          created_at: string;
        };
        Insert: {
          user_id?: string | null;
          identification_id?: string | null;
          rating?: number | null;
          category?: string | null;
          message?: string | null;
        };
      };
    };
  };
};

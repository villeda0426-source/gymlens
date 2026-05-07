import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export function useEquipmentSearch() {
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, category?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      let q = supabase.from("equipment").select("*");

      if (query.trim()) {
        q = q.ilike("name", `%${query.trim()}%`);
      }

      if (category && category !== "all") {
        q = q.eq("category", category);
      }

      q = q.order("name").limit(100);

      const { data, error: sbError } = await q;
      if (sbError) throw sbError;
      setResults(data || []);
    } catch (err: any) {
      setError(err.message || "Search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { search, results, isLoading, error };
}

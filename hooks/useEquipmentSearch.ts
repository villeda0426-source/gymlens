import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export function useEquipmentSearch() {
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, category?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const cleanQuery = query.trim();
      if (cleanQuery) params.set("q", cleanQuery);
      if (category && category !== "all") params.set("category", category);

      const data = await apiFetch<any[]>(`/api/search?${params.toString()}`, {}, 12000);
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

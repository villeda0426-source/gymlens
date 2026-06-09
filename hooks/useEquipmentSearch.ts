import { useState, useCallback } from "react";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001";

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

      const res = await fetch(`${API_BASE}/api/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Search failed");
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

/**
 * Verbatim copy of hooks/useEquipmentSearch.ts at
 * HEAD 351c4d6b80bbe1dfbdf8f80775e9e661da2103fd (sha256 in baseline.json).
 *
 * Only two things differ, both mechanical:
 *  - `react` / `@/lib/api` imports are replaced by the pilot harness.
 *  - the hook is wrapped in a factory so apiFetch can be injected.
 * The body between setIsLoading(true) and the closing brace is unchanged.
 */
import { useState, useCallback } from "../harness/hooks-runtime";

type ApiFetch = <T = unknown>(path: string, init?: unknown, timeoutMs?: number) => Promise<T>;

export function createUseEquipmentSearch(apiFetch: ApiFetch) {
  return function useEquipmentSearch() {
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
  };
}

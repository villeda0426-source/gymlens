/**
 * Candidate fix for the overlapping-request races in
 * hooks/useEquipmentSearch.ts. Pilot copy only — app source is unchanged.
 *
 * Change: a monotonic request id held in a ref. Every state write from an
 * async continuation is gated on that continuation still being the newest
 * request, so a slower earlier search can no longer publish its results, its
 * error, or its completion over a newer one.
 *
 * Deliberately NOT done here: passing an AbortSignal into apiFetch. lib/api.ts
 * line 103 does `const signal = init.signal ?? controller.signal`, so supplying
 * a caller signal replaces the internal timeout controller and the timeoutMs
 * abort stops taking effect. Reported as a separate finding, not fixed.
 */
import { useState, useCallback, useRef } from "../harness/hooks-runtime";

type ApiFetch = <T = unknown>(path: string, init?: unknown, timeoutMs?: number) => Promise<T>;

export function createUseEquipmentSearch(apiFetch: ApiFetch) {
  return function useEquipmentSearch() {
    const [results, setResults] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const latestRequestIdRef = useRef(0);

    const search = useCallback(async (query: string, category?: string) => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        const cleanQuery = query.trim();
        if (cleanQuery) params.set("q", cleanQuery);
        if (category && category !== "all") params.set("category", category);

        const data = await apiFetch<any[]>(`/api/search?${params.toString()}`, {}, 12000);
        if (latestRequestIdRef.current !== requestId) return;
        setResults(data || []);
      } catch (err: any) {
        if (latestRequestIdRef.current !== requestId) return;
        setError(err.message || "Search failed");
        setResults([]);
      } finally {
        if (latestRequestIdRef.current === requestId) setIsLoading(false);
      }
    }, []);

    return { search, results, isLoading, error };
  };
}

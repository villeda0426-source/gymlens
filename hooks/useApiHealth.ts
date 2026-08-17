import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { apiHealthCheck } from "@/lib/api";

const HEALTH_CHECK_INTERVAL_MS = 60000;

export function useApiHealth() {
  const [isApiHealthy, setIsApiHealthy] = useState<boolean | null>(null);
  const checkingRef = useRef(false);

  const checkNow = useCallback(async () => {
    if (checkingRef.current) return isApiHealthy;
    checkingRef.current = true;
    try {
      const healthy = await apiHealthCheck();
      setIsApiHealthy(healthy);
      return healthy;
    } finally {
      checkingRef.current = false;
    }
  }, [isApiHealthy]);

  useEffect(() => {
    checkNow();
    const interval = setInterval(checkNow, HEALTH_CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkNow();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [checkNow]);

  return { isApiHealthy, checkNow };
}

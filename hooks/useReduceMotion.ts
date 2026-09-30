import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// Small, reusable "should I animate this?" flag. Screens/components that add
// a custom transition (not a plain style change) should gate it on this
// rather than assuming motion is always wanted.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (mounted) setReduceMotion(!!value);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (value: boolean) => {
      setReduceMotion(!!value);
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}

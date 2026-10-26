// Central screen_view tracking. Reads expo-router's current segments (route
// pattern, e.g. "equipment/[id]" — never parameter values or query strings)
// and records each change of active screen once. Renders nothing and never
// navigates, so routing, deep links and auth redirects are unaffected.
import { useEffect } from "react";
import { useSegments } from "expo-router";
import { screenNameFromSegments } from "@/shared/analyticsEvents";
import { trackScreen } from "@/lib/analytics";

export default function AnalyticsScreenTracker() {
  const segments = useSegments() as string[];
  const screen = screenNameFromSegments(segments);

  useEffect(() => {
    trackScreen(screen);
  }, [screen]);

  return null;
}

// Central screen_view tracking. Reads expo-router's current segments (route
// pattern, e.g. "equipment/[id]" — never parameter values or query strings)
// and records each change of active screen once. Renders nothing and never
// navigates, so routing, deep links and auth redirects are unaffected. A
// screen counts once it has been active for SETTLE_MS, so a route that is
// immediately redirected (e.g. tabs → login when signed out) isn't recorded.
import { useEffect } from "react";
import { useSegments } from "expo-router";
import { screenNameFromSegments } from "@/shared/analyticsEvents";
import { trackScreen } from "@/lib/analytics";

const SETTLE_MS = 500;

export default function AnalyticsScreenTracker() {
  const segments = useSegments() as string[];
  const screen = screenNameFromSegments(segments);

  useEffect(() => {
    const timer = setTimeout(() => trackScreen(screen), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [screen]);

  return null;
}

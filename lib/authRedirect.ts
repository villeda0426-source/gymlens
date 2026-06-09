import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";

export const AUTH_CALLBACK_PATH = "auth/callback";

export function getAuthRedirectUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

function getUrlParams(url: string) {
  const normalized = url.replace("#", "?");
  const parsed = Linking.parse(normalized);
  return parsed.queryParams || {};
}

export async function handleAuthRedirectUrl(url: string) {
  const params = getUrlParams(url);
  const code = typeof params.code === "string" ? params.code : null;
  const accessToken = typeof params.access_token === "string" ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === "string" ? params.refresh_token : null;
  const error = typeof params.error_description === "string"
    ? params.error_description
    : typeof params.error === "string"
      ? params.error
      : null;

  if (error) {
    throw new Error(error);
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return true;
  }

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    return true;
  }

  return false;
}

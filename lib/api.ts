import Constants from "expo-constants";
import { Platform } from "react-native";

const LOCAL_API_BASE = "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 30000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [350, 900];

export class ApiError extends Error {
  status?: number;
  isNetworkError: boolean;

  constructor(message: string, options: { status?: number; isNetworkError?: boolean } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

function isDevBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function getApiBase(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (isDevBuild() || Constants.appOwnership === "expo") return LOCAL_API_BASE;
  return null;
}

export function getApiUnavailableMessage(): string {
  const base = getApiBase();
  if (!base) {
    return "SpotLift services are not configured for this build. Please install the latest version or try again later.";
  }
  return `Cannot reach SpotLift services. Check your connection and try again.`;
}

export function getNativeBuildNumber(): number {
  const nativeBuildVersion = Number.parseInt(Constants.nativeBuildVersion ?? "", 10);
  if (Number.isFinite(nativeBuildVersion)) return nativeBuildVersion;

  const iosBuildNumber = Number.parseInt(Constants.expoConfig?.ios?.buildNumber ?? "", 10);
  if (Number.isFinite(iosBuildNumber)) return iosBuildNumber;

  const androidVersionCode = Number.parseInt(String(Constants.expoConfig?.android?.versionCode ?? ""), 10);
  if (Number.isFinite(androidVersionCode)) return androidVersionCode;

  return 0;
}

export function getNativeAppVersion(): string {
  return Constants.nativeAppVersion || Constants.expoConfig?.version || "0.0.0";
}

export function getAppRequestHeaders(): Record<string, string> {
  return {
    "x-spotlift-platform": Platform.OS,
    "x-spotlift-version": getNativeAppVersion(),
    "x-spotlift-build": String(getNativeBuildNumber()),
  };
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRequestMethod(init: RequestInit): string {
  return String(init.method || "GET").toUpperCase();
}

function canRetryRequest(init: RequestInit): boolean {
  const method = getRequestMethod(init);
  return method === "GET" || method === "HEAD";
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new ApiError(getApiUnavailableMessage(), { isNetworkError: true });
  }

  const maxAttempts = canRetryRequest(init) ? RETRY_DELAYS_MS.length + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init.signal ?? controller.signal;
    const headers = {
      ...getAppRequestHeaders(),
      ...(init.headers ?? {}),
    };

    try {
      const response = await fetch(`${base}${path}`, { ...init, headers, signal });
      const data = await parseResponseBody(response);
      if (!response.ok) {
        if (attempt < maxAttempts - 1 && RETRYABLE_STATUSES.has(response.status)) {
          await delay(RETRY_DELAYS_MS[attempt]);
          continue;
        }

        const fallbackMessage =
          response.status === 404
            ? "That SpotLift feature is temporarily unavailable. Please update the app or try again in a moment."
            : `SpotLift service error (${response.status}).`;
        throw new ApiError(
          typeof data?.error === "string" ? data.error : fallbackMessage,
          { status: response.status }
        );
      }
      return data as T;
    } catch (error: any) {
      if (error instanceof ApiError) throw error;
      if (attempt < maxAttempts - 1 && !init.signal) {
        await delay(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new ApiError(getApiUnavailableMessage(), { isNetworkError: true });
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ApiError(getApiUnavailableMessage(), { isNetworkError: true });
}

export async function apiHealthCheck(): Promise<boolean> {
  try {
    const result = await apiFetch<{ status: string }>("/health", {}, 6000);
    return result?.status === "ok";
  } catch {
    return false;
  }
}

import Constants from "expo-constants";
import { Platform } from "react-native";
import { Sentry } from "./sentry";

const LOCAL_API_BASE = "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 30000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [350, 900];

export class ApiError extends Error {
  status?: number;
  code: string;
  requestId?: string;
  retryable: boolean;
  isNetworkError: boolean;
  isTimeout: boolean;
  isCanceled: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      requestId?: string;
      retryable?: boolean;
      isNetworkError?: boolean;
      isTimeout?: boolean;
      isCanceled?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code ?? "UNKNOWN_ERROR";
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.isNetworkError = options.isNetworkError ?? false;
    this.isTimeout = options.isTimeout ?? false;
    this.isCanceled = options.isCanceled ?? false;
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

export function createRequestId(scope = "request"): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `spotlift-${scope}-${Date.now().toString(36)}-${random}`;
}

export function createIdempotencyKey(scope: string): string {
  return createRequestId(`idempotency-${scope}`);
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

function makeRequestController(upstreamSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const cancelFromUpstream = () => controller.abort();
  if (upstreamSignal?.aborted) {
    cancelFromUpstream();
  } else {
    upstreamSignal?.addEventListener("abort", cancelFromUpstream, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", cancelFromUpstream);
    },
  };
}

function reportApiFailure(path: string, error: ApiError) {
  if (error.isCanceled || (!error.isTimeout && (error.status ?? 0) < 500)) return;

  Sentry.captureException(error, {
    tags: {
      api_path: path,
      api_error_code: error.code,
      api_retryable: String(error.retryable),
    },
    extra: {
      status: error.status,
      requestId: error.requestId,
      isNetworkError: error.isNetworkError,
      isTimeout: error.isTimeout,
    },
  });
}

export async function apiFetch<T = any>(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new ApiError(getApiUnavailableMessage(), {
      code: "API_NOT_CONFIGURED",
      isNetworkError: true,
    });
  }

  const maxAttempts = canRetryRequest(init) ? RETRY_DELAYS_MS.length + 1 : 1;
  const requestId = createRequestId("api");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const request = makeRequestController(init.signal, timeoutMs);
    const headers = {
      ...getAppRequestHeaders(),
      "x-request-id": requestId,
      ...(init.headers ?? {}),
    };

    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers,
        signal: request.signal,
      });
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
          {
            status: response.status,
            code: typeof data?.code === "string" ? data.code : `HTTP_${response.status}`,
            requestId:
              typeof data?.requestId === "string"
                ? data.requestId
                : response.headers.get("x-request-id") || requestId,
            retryable:
              typeof data?.retryable === "boolean"
                ? data.retryable
                : RETRYABLE_STATUSES.has(response.status),
          }
        );
      }
      return data as T;
    } catch (error: any) {
      if (error instanceof ApiError) {
        reportApiFailure(path, error);
        throw error;
      }

      const canceledByCaller = init.signal?.aborted === true;
      const timedOut = request.didTimeOut();
      if (attempt < maxAttempts - 1 && !canceledByCaller) {
        await delay(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      const apiError = canceledByCaller
        ? new ApiError("Request canceled.", {
            code: "REQUEST_CANCELED",
            requestId,
            isCanceled: true,
          })
        : timedOut
          ? new ApiError("SpotLift is taking longer than expected. Please try again.", {
              code: "REQUEST_TIMEOUT",
              requestId,
              retryable: true,
              isNetworkError: true,
              isTimeout: true,
            })
          : new ApiError(getApiUnavailableMessage(), {
              code: "NETWORK_UNAVAILABLE",
              requestId,
              retryable: true,
              isNetworkError: true,
            });

      reportApiFailure(path, apiError);
      throw apiError;
    } finally {
      request.cleanup();
    }
  }

  throw new ApiError(getApiUnavailableMessage(), {
    code: "NETWORK_UNAVAILABLE",
    requestId,
    retryable: true,
    isNetworkError: true,
  });
}

export async function apiHealthCheck(): Promise<boolean> {
  try {
    const result = await apiFetch<{ status: string }>("/health/ready", {}, 6000);
    return result?.status === "ready";
  } catch {
    return false;
  }
}

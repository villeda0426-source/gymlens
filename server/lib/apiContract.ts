import { randomUUID } from "node:crypto";
import { Request, Response } from "express";

const SAFE_REQUEST_ID = /^[a-zA-Z0-9._:-]{8,128}$/;

export type ApiErrorBody = {
  error: string;
  code: string;
  retryable: boolean;
  requestId: string;
};

export function normalizeRequestId(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

export function getRequestId(res: Response): string {
  return typeof res.locals.requestId === "string"
    ? res.locals.requestId
    : normalizeRequestId(undefined);
}

export function makeApiErrorBody(
  requestId: string,
  code: string,
  message: string,
  retryable = false
): ApiErrorBody {
  return {
    error: message,
    code,
    retryable,
    requestId,
  };
}

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  retryable = false
) {
  return res
    .status(status)
    .json(makeApiErrorBody(getRequestId(res), code, message, retryable));
}

export function requestObservability(req: Request, res: Response, next: () => void) {
  const requestId = normalizeRequestId(req.header("x-request-id"));
  const startedAt = Date.now();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.once("finish", () => {
    const entry = {
      event: "http_request",
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      platform: req.header("x-spotlift-platform") || "unknown",
      appVersion: req.header("x-spotlift-version") || "unknown",
      appBuild: req.header("x-spotlift-build") || "unknown",
    };

    const line = JSON.stringify(entry);
    if (res.statusCode >= 500) console.error(line);
    else if (res.statusCode >= 400) console.warn(line);
    else console.log(line);
  });

  next();
}

export function structuredErrorResponses(
  _req: Request,
  res: Response,
  next: () => void
) {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    if (
      res.statusCode >= 400 &&
      body &&
      typeof body === "object" &&
      typeof (body as { error?: unknown }).error === "string"
    ) {
      const existing = body as Record<string, unknown>;
      const retryable =
        typeof existing.retryable === "boolean"
          ? existing.retryable
          : res.statusCode === 408 ||
            res.statusCode === 425 ||
            res.statusCode === 429 ||
            res.statusCode >= 500;

      return originalJson({
        ...existing,
        code:
          typeof existing.code === "string"
            ? existing.code
            : `HTTP_${res.statusCode}`,
        retryable,
        requestId:
          typeof existing.requestId === "string"
            ? existing.requestId
            : getRequestId(res),
      });
    }

    return originalJson(body);
  }) as Response["json"];

  next();
}

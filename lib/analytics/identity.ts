// In-memory analytics identifiers, readable synchronously (lib/api.ts adds the
// installation id to every backend request). Loaded and persisted by
// lib/analytics/index.ts; this module has no imports so it can't form a cycle.

let installationId: string | null = null;

export function getInstallationId(): string | null {
  return installationId;
}

export function setInstallationId(id: string): void {
  installationId = id;
}

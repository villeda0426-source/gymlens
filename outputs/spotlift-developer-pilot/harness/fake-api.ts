/**
 * Controlled stand-in for `lib/api.ts` apiFetch.
 *
 * No network, no timers, no app imports. Each call is parked as a deferred
 * promise so the test drives completion order explicitly, which is what makes
 * overlapping-request ordering reproducible instead of timing-dependent.
 */

export class FakeApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type PendingCall = {
  id: number;
  path: string;
  resolve: (data: unknown) => Promise<void>;
  reject: (message: string) => Promise<void>;
};

export type FakeApi = {
  apiFetch: <T = unknown>(path: string, init?: unknown, timeoutMs?: number) => Promise<T>;
  calls: PendingCall[];
  /** Let every already-scheduled microtask continuation run. */
  flush: () => Promise<void>;
};

export function createFakeApi(): FakeApi {
  const calls: PendingCall[] = [];
  let nextId = 1;

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  const apiFetch = <T,>(path: string): Promise<T> => {
    const id = nextId++;
    let settle!: (value: T) => void;
    let fail!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      settle = res;
      fail = rej;
    });

    calls.push({
      id,
      path,
      resolve: async (data: unknown) => {
        settle(data as T);
        await flush();
      },
      reject: async (message: string) => {
        fail(new FakeApiError(message));
        await flush();
      },
    });

    return promise;
  };

  return { apiFetch: apiFetch as FakeApi["apiFetch"], calls, flush };
}

import { setNetworkStatus } from "./networkStatus";

export const DEFAULT_RETRY_DELAYS = [500, 1500, 4000] as const;

export interface FetchWithRetryOptions extends RequestInit {
  /** Delay before each retry. The request always stops after this finite list. */
  retryDelays?: readonly number[];
  /**
   * "network" retries any network-class failure.
   * "offline-only" retries only when the browser confirms it was offline,
   * which is suitable for non-idempotent sends that must not be duplicated.
   * "never" performs one attempt.
   */
  retrySafety?: "network" | "offline-only" | "never";
}

function abortError(): Error {
  if (typeof DOMException !== "undefined") return new DOMException("Aborted", "AbortError");
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkClassError(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    return error.name === "AbortError"
      || error.name === "NetworkError"
      || error.name === "TimeoutError";
  }
  return false;
}

function waitForDelay(delay: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, delay));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    retryDelays = DEFAULT_RETRY_DELAYS,
    retrySafety = "network",
    ...init
  } = options;
  let retryIndex = 0;
  const startedOffline = browserIsOffline();

  while (true) {
    if (init.signal?.aborted) throw abortError();
    try {
      const response = await fetch(input, init);
      setNetworkStatus(browserIsOffline() ? "offline" : "online");
      return response;
    } catch (error) {
      const networkFailure = isNetworkClassError(error, init.signal);
      const allowedBySafety = retrySafety === "network"
        ? true
        : retrySafety === "offline-only" && startedOffline && retryIndex === 0;
      const retryLimit = retrySafety === "offline-only"
        ? Math.min(retryDelays.length, 1)
        : retryDelays.length;
      const canRetry = networkFailure
        && allowedBySafety
        && retryIndex < retryLimit;

      setNetworkStatus(browserIsOffline() ? "offline" : "retrying");
      if (!canRetry) throw error;
      const delay = retryDelays[retryIndex++];
      await waitForDelay(delay, init.signal);
    }
  }
}

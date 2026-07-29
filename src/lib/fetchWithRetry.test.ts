import { afterEach, describe, expect, test } from "bun:test";
import { fetchWithRetry, isNetworkClassError } from "./fetchWithRetry";

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete (globalThis as { navigator?: Navigator }).navigator;
});

describe("fetchWithRetry", () => {
  test("retries network failures with a finite bound", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    await expect(fetchWithRetry("/api/test", { retryDelays: [0, 0] })).rejects.toThrow("Failed to fetch");
    expect(calls).toBe(3);
  });

  test("returns after a later network attempt succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls < 2) throw new TypeError("Network changed");
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const response = await fetchWithRetry("/api/test", { retryDelays: [0, 0] });
    expect(await response.text()).toBe("ok");
    expect(calls).toBe(2);
  });

  test("never retries HTTP responses", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("bad", { status: 503 });
    }) as unknown as typeof fetch;

    const response = await fetchWithRetry("/api/test", { retryDelays: [0, 0] });
    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  test("does not retry an explicitly aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new DOMException("Aborted", "AbortError");
    }) as unknown as typeof fetch;

    await expect(fetchWithRetry("/api/test", {
      signal: controller.signal,
      retryDelays: [0, 0],
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(0);
  });

  test("does not retry a non-idempotent send when delivery is ambiguous", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: true },
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new TypeError("ERR_NETWORK_CHANGED");
    }) as unknown as typeof fetch;

    await expect(fetchWithRetry("/api/send", {
      method: "POST",
      retrySafety: "offline-only",
      retryDelays: [0],
    })).rejects.toThrow("ERR_NETWORK_CHANGED");
    expect(calls).toBe(1);
  });

  test("does not retry a send that changes from online to offline mid-request", async () => {
    const connection = { onLine: true };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: connection,
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      connection.onLine = false;
      throw new TypeError("ERR_NETWORK_CHANGED");
    }) as unknown as typeof fetch;

    await expect(fetchWithRetry("/api/send", {
      method: "POST",
      retrySafety: "offline-only",
      retryDelays: [0],
    })).rejects.toThrow("ERR_NETWORK_CHANGED");
    expect(calls).toBe(1);
  });

  test("allows one send retry when the browser confirms it is offline", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: false },
    });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw new TypeError("offline before delivery");
      return new Response("ok");
    }) as unknown as typeof fetch;

    const response = await fetchWithRetry("/api/send", {
      method: "POST",
      retrySafety: "offline-only",
      retryDelays: [0],
    });
    expect(response.ok).toBe(true);
    expect(calls).toBe(2);
  });

  test("recognizes network-class errors but not ordinary errors", () => {
    expect(isNetworkClassError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkClassError(new DOMException("Network changed", "AbortError"))).toBe(true);
    expect(isNetworkClassError(new Error("application bug"))).toBe(false);
  });
});

import { create } from "zustand";
import { apiUrl } from "./api";
import { fetchWithRetry } from "./fetchWithRetry";

interface CaptureStore {
  captures: Record<string, string>;
  updatedAt: Record<string, number>;
  setCapture: (target: string, content: string) => void;
}

export const useCaptureStore = create<CaptureStore>()((set) => ({
  captures: {},
  updatedAt: {},
  setCapture: (target, content) => set((state) => {
    if (state.captures[target] === content) return state;
    return {
      captures: { ...state.captures, [target]: content },
      updatedAt: { ...state.updatedAt, [target]: Date.now() },
    };
  }),
}));

const inFlight = new Map<string, Promise<string>>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

export function useCaptureContent(target: string): string {
  return useCaptureStore((state) => state.captures[target] || "");
}

export function setCaptureContent(target: string, content: string): void {
  useCaptureStore.getState().setCapture(target, content);
}

export function refreshCapture(target: string): Promise<string> {
  if (!target) return Promise.resolve("");
  const existing = inFlight.get(target);
  if (existing) return existing;
  const request = fetchWithRetry(apiUrl(`/api/capture?target=${encodeURIComponent(target)}`), {
    retryDelays: [250, 750],
  })
    .then((response) => response.json())
    .then((data) => {
      const content = data.content || "";
      setCaptureContent(target, content);
      return content;
    })
    .catch(() => "")
    .finally(() => inFlight.delete(target));
  inFlight.set(target, request);
  return request;
}

/**
 * A finite refresh burst after an input/activity event. The first request
 * catches immediate redraws; the second catches command output that lands
 * shortly afterwards. Repeated events coalesce per target, so idle stays idle.
 */
export function requestCaptureRefresh(target: string): void {
  if (!target || typeof window === "undefined") return;
  for (const timer of refreshTimers.get(target) || []) clearTimeout(timer);
  const timers = [
    setTimeout(() => void refreshCapture(target), 120),
    setTimeout(() => {
      void refreshCapture(target);
      refreshTimers.delete(target);
    }, 850),
  ];
  refreshTimers.set(target, timers);
}

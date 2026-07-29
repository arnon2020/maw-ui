import { useSyncExternalStore } from "react";

interface StaticModeController {
  get: () => boolean;
  set: (enabled: boolean) => void;
}

declare global {
  interface Window {
    mawStaticMode?: StaticModeController;
  }
}

const STORAGE_KEY = "maw-static-mode";

function fallbackValue(): boolean {
  const query = new URLSearchParams(window.location.search).get("static");
  if (query === "1") return true;
  if (query === "0") return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored !== "0";
  } catch {
    return true;
  }
}

export function isStaticMode(): boolean {
  return window.mawStaticMode?.get() ?? fallbackValue();
}

export function setStaticMode(enabled: boolean): void {
  if (window.mawStaticMode) {
    window.mawStaticMode.set(enabled);
    return;
  }
  try { localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch {}
  document.documentElement.classList.toggle("static-mode", enabled);
  window.dispatchEvent(new CustomEvent("maw:static-mode", { detail: enabled }));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener("maw:static-mode", listener);
  return () => window.removeEventListener("maw:static-mode", listener);
}

export function useStaticMode(): boolean {
  return useSyncExternalStore(subscribe, isStaticMode, () => true);
}

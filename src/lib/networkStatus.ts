import { create } from "zustand";

export type NetworkStatus = "online" | "retrying" | "offline";

interface NetworkStatusState {
  status: NetworkStatus;
  setStatus: (status: NetworkStatus) => void;
}

function initialStatus(): NetworkStatus {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  return "online";
}

export const useNetworkStatusStore = create<NetworkStatusState>()((set) => ({
  status: initialStatus(),
  setStatus: (status) => set((state) => state.status === status ? state : { status }),
}));

export function setNetworkStatus(status: NetworkStatus): void {
  useNetworkStatusStore.getState().setStatus(status);
}

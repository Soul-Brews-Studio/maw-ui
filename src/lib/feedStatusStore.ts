import { create } from "zustand";
import type { PaneStatus } from "./types";

interface FeedStatusStore {
  /** target → PaneStatus */
  statuses: Record<string, PaneStatus>;
  setStatus: (target: string, status: PaneStatus) => void;
  getStatus: (target: string) => PaneStatus;
}

export const useFeedStatusStore = create<FeedStatusStore>()((set, get) => ({
  statuses: {},
  setStatus: (target, status) => set((s) => {
    if (s.statuses[target] === status) return s;
    return { statuses: { ...s.statuses, [target]: status } };
  }),
  getStatus: (target) => get().statuses[target] || "idle",
}));

/** Hook: subscribe to a single agent's status (no re-render from other agents) */
export function useAgentStatus(target: string): PaneStatus {
  return useFeedStatusStore((s) => s.statuses[target] || "idle");
}

/** Hook: get live status for an agent object (replaces stale agent.status) */
export function useLiveStatus(agent: { target: string }): PaneStatus {
  return useFeedStatusStore((s) => s.statuses[agent.target] || "idle");
}

/** Hook: subscribe to ALL statuses — use for aggregate counts (dashboard, fleet) */
export function useAllStatuses(): Record<string, PaneStatus> {
  return useFeedStatusStore((s) => s.statuses);
}

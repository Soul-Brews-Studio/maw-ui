import { create } from "zustand";
import type { AgentNode, AgentEdge, Particle } from "./types";
import type { FeedEvent } from "../../lib/feed";
import { BUSY_EVENTS, STOP_EVENTS } from "./types";

interface FederationStore {
  agents: AgentNode[];
  edges: AgentEdge[];
  machines: string[];
  statuses: Record<string, string>;
  flashes: Record<string, number>;
  selected: string | null;
  hovered: string | null;
  version: string;
  particles: Map<string, Particle[]>;

  setGraph: (agents: AgentNode[], edges: AgentEdge[], particles: Map<string, Particle[]>) => void;
  setVersion: (v: string) => void;
  setSelected: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  handleFeedEvent: (e: FeedEvent) => void;
  handleFeedHistory: (events: FeedEvent[]) => void;
}

export const useFederationStore = create<FederationStore>((set) => ({
  agents: [],
  edges: [],
  machines: [],
  statuses: {},
  flashes: {},
  selected: null,
  hovered: null,
  version: "",
  particles: new Map(),

  setGraph: (agents, edges, particles) => set({
    agents,
    edges,
    particles,
    machines: [...new Set(agents.map(a => a.node))],
  }),

  setVersion: (version) => set({ version }),

  setSelected: (id) => set((s) => ({ selected: s.selected === id ? null : id })),

  setHovered: (id) => set({ hovered: id }),

  handleFeedEvent: (e) => set((s) => {
    if (BUSY_EVENTS.has(e.event)) {
      return {
        statuses: { ...s.statuses, [e.oracle]: "busy" },
        flashes: { ...s.flashes, [e.oracle]: Date.now() },
      };
    }
    if (STOP_EVENTS.has(e.event)) {
      return { statuses: { ...s.statuses, [e.oracle]: "ready" } };
    }
    return s;
  }),

  handleFeedHistory: (events) => set(() => {
    const st: Record<string, string> = {};
    for (const e of events) {
      if (BUSY_EVENTS.has(e.event)) st[e.oracle] = "busy";
      else if (STOP_EVENTS.has(e.event)) st[e.oracle] = "ready";
    }
    return { statuses: st };
  }),
}));

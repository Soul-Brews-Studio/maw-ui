import { create } from "zustand";
import type { AgentNode, AgentEdge, Particle, LiveMessage } from "./types";
import type { FeedEvent } from "../../lib/feed";
import { BUSY_EVENTS, STOP_EVENTS } from "./types";

export interface MessageEntry {
  from: string;
  to: string;
  msg: string;
  ts: number;
  live?: boolean;
}

export interface PluginInfo {
  name: string;
  type: string;
  events: number;
  errors: number;
  lastEvent: string;
  loadedAt: string;
}

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
  plugins: PluginInfo[];
  liveMessages: LiveMessage[];
  messageLog: MessageEntry[];
  edgePulses: Record<string, number>; // edge key -> timestamp of last pulse
  showLineage: boolean;
  showHistoryEdges: boolean;
  layout: string;

  setGraph: (agents: AgentNode[], edges: AgentEdge[], particles: Map<string, Particle[]>) => void;
  setVersion: (v: string) => void;
  setSelected: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  setPlugins: (plugins: PluginInfo[]) => void;
  setMessageLog: (messages: MessageEntry[]) => void;
  clearMessages: () => void;
  toggleLineage: () => void;
  setLayout: (layout: string) => void;
  handleFeedEvent: (e: FeedEvent) => void;
  handleFeedHistory: (events: FeedEvent[]) => void;
  handleLiveMessage: (from: string, to: string) => void;
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
  plugins: [],
  liveMessages: [],
  messageLog: [],
  edgePulses: {},
  showLineage: false,
  showHistoryEdges: true,
  layout: "force",

  setGraph: (agents, edges, particles) => set({
    agents,
    edges,
    particles,
    machines: [...new Set(agents.map(a => a.node))],
  }),

  setVersion: (version) => set({ version }),

  setSelected: (id) => set((s) => ({ selected: s.selected === id ? null : id })),

  setHovered: (id) => set({ hovered: id }),

  setPlugins: (plugins) => set({ plugins }),
  setMessageLog: (messages) => set({ messageLog: messages }),
  clearMessages: () => set({ messageLog: [], liveMessages: [] }),
  toggleLineage: () => set((s) => ({ showLineage: !s.showLineage })),
  setLayout: (layout) => set({ layout }),

  handleFeedEvent: (e) => set((s) => {
    const updates: Partial<FederationStore> = {};

    if (BUSY_EVENTS.has(e.event)) {
      updates.statuses = { ...s.statuses, [e.oracle]: "busy" };
      updates.flashes = { ...s.flashes, [e.oracle]: Date.now() };
    }
    if (STOP_EVENTS.has(e.event)) {
      updates.statuses = { ...s.statuses, [e.oracle]: "ready" };
    }

    // Show UserPromptSubmit in message log as "user → oracle" (dedupe within 3s)
    if (e.event === "UserPromptSubmit" && e.oracle) {
      const name = e.oracle.replace(/-oracle$/, "").replace(/-view$/, "");
      const now = Date.now();
      const isDupe = s.messageLog.some(m =>
        m.from === "user" && m.to === name && Math.abs(m.ts - now) < 3000);
      if (!isDupe) {
        const msg: MessageEntry = {
          from: "user",
          to: name,
          msg: (e.message || "").slice(0, 120),
          ts: now,
          live: true,
        };
        updates.messageLog = [msg, ...s.messageLog].slice(0, 200);
      }
    }

    return Object.keys(updates).length > 0 ? updates : s;
  }),

  handleFeedHistory: (events) => set(() => {
    const st: Record<string, string> = {};
    for (const e of events) {
      if (BUSY_EVENTS.has(e.event)) st[e.oracle] = "busy";
      else if (STOP_EVENTS.has(e.event)) st[e.oracle] = "ready";
    }
    return { statuses: st };
  }),

  handleLiveMessage: (from, to) => set((s) => {
    const now = Date.now();
    const key = [from, to].sort().join("-");
    const msg: LiveMessage = { from, to, ts: now };
    const msgs = [...s.liveMessages, msg].slice(-50);

    // If no edge exists between from/to, create a temporary message edge
    const hasEdge = s.edges.some(e =>
      (e.source === from && e.target === to) || (e.source === to && e.target === from));
    const edges = hasEdge ? s.edges : [...s.edges, { source: from, target: to, type: "message" as const, count: 1 }];

    return {
      liveMessages: msgs,
      edges,
      edgePulses: { ...s.edgePulses, [key]: now },
      flashes: { ...s.flashes, [from]: now, [to]: now },
    };
  }),
}));

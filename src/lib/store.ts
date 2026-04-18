import { create } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";
import { apiUrl } from "./api";

export interface RecentEntry {
  name: string;
  session: string;
  target: string;
  lastBusy: number;
}

import type { AskItem, BoardItem, BoardField, ScanResult, ScanMineResult, TimelineItem, PulseBoard, TaskActivity, TaskLogSummary, Project, ProjectTask } from "./types";
import type { CrossTeamQueueItem, CrossTeamQueueResponse, CrossTeamQueueParseError } from "./cross-team-queue-types";

export interface DispatchStatus {
  step: "routing" | "done" | "error";
  oracle?: string;
  oracleName?: string;
  target?: string;
  message?: string;
  error?: string;
  task?: string;
  ts: number;
}

interface FleetStore {
  // Recently active: target → agent metadata + timestamp
  recentMap: Record<string, RecentEntry>;
  markBusy: (agents: { target: string; name: string; session: string }[], at?: number) => void;
  pruneRecent: () => void;

  // Slept agents (Ctrl+C'd from UI — grey + collapsed until wake/busy)
  sleptTargets: string[];
  markSlept: (target: string) => void;
  clearSlept: (target: string) => void;

  // UI preferences
  sortMode: "active" | "name";
  setSortMode: (mode: "active" | "name") => void;
  grouped: boolean;
  toggleGrouped: () => void;
  collapsed: string[];
  toggleCollapsed: (key: string) => void;
  muted: boolean;
  toggleMuted: () => void;
  stageMode: "stage" | "pitch";
  toggleStageMode: () => void;

  // Route persistence
  lastView: string;
  setLastView: (view: string) => void;

  // Dispatch log (BoB task routing)
  dispatchLog: DispatchStatus[];
  addDispatchStatus: (status: Omit<DispatchStatus, "ts">) => void;

  // Inbox asks
  asks: AskItem[];
  addAsk: (ask: Omit<AskItem, "id" | "ts">) => void;
  dismissAsk: (id: string) => void;
  dismissByOracle: (oracle: string) => void;

  // Cross-team queue (Patch 6 inbox scan — FORGE /api/cross-team-queue)
  queue: CrossTeamQueueItem[];
  queueScannedAt: string | null;
  queueParseErrors: CrossTeamQueueParseError[];
  queueEmptyInboxes: string[];
  queueError: string | null;
  setQueue: (res: CrossTeamQueueResponse) => void;
  setQueueError: (err: string | null) => void;

  // Board state (non-persisted)
  boardItems: BoardItem[];
  boardFields: BoardField[];
  boardLoading: boolean;
  boardFilter: string;
  boardSubView: "board" | "timeline" | "scan" | "activity" | "pulse" | "projects";
  scanResults: ScanResult[];
  scanMineResults: ScanMineResult[];
  timelineData: TimelineItem[];
  setBoardItems: (items: BoardItem[]) => void;
  setBoardFields: (fields: BoardField[]) => void;
  setBoardLoading: (loading: boolean) => void;
  setBoardFilter: (filter: string) => void;
  setBoardSubView: (view: "board" | "timeline" | "scan" | "activity" | "pulse" | "projects") => void;
  setScanResults: (results: ScanResult[]) => void;
  setScanMineResults: (results: ScanMineResult[]) => void;
  setTimelineData: (data: TimelineItem[]) => void;

  // Pulse state (non-persisted)
  pulseBoard: PulseBoard | null;
  setPulseBoard: (data: PulseBoard) => void;

  // Task log state (non-persisted)
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  taskActivities: TaskActivity[];
  setTaskActivities: (activities: TaskActivity[]) => void;
  addTaskActivity: (activity: TaskActivity) => void;
  taskLogSummaries: Record<string, TaskLogSummary>;
  setTaskLogSummaries: (summaries: Record<string, TaskLogSummary>) => void;

  // Project state (non-persisted)
  projectBoardProjects: (Project & { enrichedTasks: (ProjectTask & { boardItem?: BoardItem })[] })[];
  projectBoardUnassigned: BoardItem[];
  projectBoardFields: BoardField[];
  setProjectBoard: (data: { projects: any[]; unassigned: BoardItem[]; fields?: BoardField[] }) => void;

  // Supervisor state (non-persisted)
  supervisorTracked: any[];
  setSupervisorTracked: (tracked: any[]) => void;
}

const RECENT_TTL = 30 * 60 * 1000; // 30 minutes

// --- Hybrid storage: localStorage for instant hydration + server for cross-device sync ---

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: string | null = null;

function flushWrite() {
  if (pendingWrite === null) return;
  const body = pendingWrite;
  pendingWrite = null;
  fetch(apiUrl(`/api/ui-state`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {}); // fire-and-forget
}

/** Sync server state into localStorage, then rehydrate Zustand. */
function syncFromServer(name: string) {
  fetch(apiUrl("/api/ui-state")).then(async (res) => {
    if (!res.ok) return;
    const data = await res.json();
    if (!data || Object.keys(data).length === 0) return;
    const value = JSON.stringify({ state: data, version: 2 });
    const existing = localStorage.getItem(name);
    if (value !== existing) {
      localStorage.setItem(name, value);
      useFleetStore.persist.rehydrate();
    }
  }).catch(() => {});
}

const hybridStorage: StateStorage = {
  getItem: (name) => {
    // Return localStorage synchronously → instant hydration
    // Then background-sync from server for cross-device updates
    setTimeout(() => syncFromServer(name), 0);
    return localStorage.getItem(name);
  },
  setItem: (name, value) => {
    // Write to localStorage immediately (instant on next refresh)
    localStorage.setItem(name, value);
    // Debounced write to server (cross-device sync)
    try {
      const { state } = JSON.parse(value);
      pendingWrite = JSON.stringify(state);
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(flushWrite, 1000);
    } catch {}
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    fetch(apiUrl(`/api/ui-state`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  },
};

// --- Asks persistence (separate from ui-state) ---
let askSaveTimer: ReturnType<typeof setTimeout> | null = null;
function persistAsks(asks: AskItem[]) {
  if (askSaveTimer) clearTimeout(askSaveTimer);
  askSaveTimer = setTimeout(() => {
    fetch(apiUrl(`/api/asks`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(asks),
    }).catch(() => {});
  }, 1000);
}

export const useFleetStore = create<FleetStore>()(
  persist(
    (set, get) => ({
      recentMap: {},
      markBusy: (agents, at) => set((s) => {
        const ts = at ?? Date.now();
        const next = { ...s.recentMap };
        let changed = false;
        for (const a of agents) {
          const prev = next[a.target];
          // Only update if new timestamp is more recent
          if (!prev || prev.lastBusy < ts || prev.name !== a.name || prev.session !== a.session) {
            next[a.target] = { name: a.name, session: a.session, target: a.target, lastBusy: ts };
            changed = true;
          }
        }
        return changed ? { recentMap: next } : s;
      }),
      pruneRecent: () => set((s) => {
        const now = Date.now();
        const next: Record<string, RecentEntry> = {};
        let changed = false;
        for (const [k, v] of Object.entries(s.recentMap)) {
          if (now - v.lastBusy < RECENT_TTL) next[k] = v;
          else changed = true;
        }
        return changed ? { recentMap: next } : s;
      }),

      sleptTargets: [],
      markSlept: (target) => set((s) => ({
        sleptTargets: s.sleptTargets.includes(target) ? s.sleptTargets : [...s.sleptTargets, target],
      })),
      clearSlept: (target) => set((s) => ({
        sleptTargets: s.sleptTargets.filter(t => t !== target),
      })),

      sortMode: "active",
      setSortMode: (mode) => set({ sortMode: mode }),
      grouped: true,
      toggleGrouped: () => set((s) => ({ grouped: !s.grouped })),
      collapsed: [],
      toggleCollapsed: (key) => set((s) => ({
        collapsed: s.collapsed.includes(key)
          ? s.collapsed.filter(k => k !== key)
          : [...s.collapsed, key],
      })),
      muted: false,
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      stageMode: "stage",
      toggleStageMode: () => set((s) => ({ stageMode: s.stageMode === "pitch" ? "stage" : "pitch" })),

      lastView: "office",
      setLastView: (view) => set({ lastView: view }),

      // Dispatch log
      dispatchLog: [],
      addDispatchStatus: (status) => set((s) => {
        const entry: DispatchStatus = { ...status, ts: Date.now() };
        const next = [...s.dispatchLog, entry].slice(-20);
        return { dispatchLog: next };
      }),

      // Inbox asks
      asks: [],
      addAsk: (ask) => set((s) => {
        const existing = s.asks.find((a) => a.oracle === ask.oracle && !a.dismissed);
        if (existing) {
          // Update message if new one is longer (Stop event has the real question)
          if (ask.message.length > existing.message.length) {
            const next = s.asks.map((a) => a.id === existing.id ? { ...a, message: ask.message, type: ask.type } : a);
            persistAsks(next);
            return { asks: next };
          }
          return s;
        }
        const item: AskItem = { ...ask, id: `${ask.oracle}-${Date.now()}`, ts: Date.now() };
        const next = [item, ...s.asks].slice(0, 50);
        persistAsks(next);
        return { asks: next };
      }),
      dismissAsk: (id) => set((s) => {
        const next = s.asks.map((a) => (a.id === id ? { ...a, dismissed: true } : a));
        persistAsks(next);
        return { asks: next };
      }),
      dismissByOracle: (oracle) => set((s) => {
        const hasPending = s.asks.some((a) => a.oracle === oracle && !a.dismissed);
        if (!hasPending) return s;
        const next = s.asks.map((a) => (a.oracle === oracle && !a.dismissed ? { ...a, dismissed: true } : a));
        persistAsks(next);
        return { asks: next };
      }),

      // Cross-team queue (non-persisted — server is source of truth, 30s refresh)
      queue: [],
      queueScannedAt: null,
      queueParseErrors: [],
      queueEmptyInboxes: [],
      queueError: null,
      setQueue: (res) => set({
        queue: res.items,
        queueScannedAt: res.scannedAt,
        queueParseErrors: res.errors,
        queueEmptyInboxes: res.emptyInboxes,
        queueError: null,
      }),
      setQueueError: (err) => set({ queueError: err }),

      // Board state (non-persisted)
      boardItems: [],
      boardFields: [],
      boardLoading: false,
      boardFilter: "",
      boardSubView: "board",
      scanResults: [],
      scanMineResults: [],
      timelineData: [],
      setBoardItems: (items) => set({ boardItems: items }),
      setBoardFields: (fields) => set({ boardFields: fields }),
      setBoardLoading: (loading) => set({ boardLoading: loading }),
      setBoardFilter: (filter) => set({ boardFilter: filter }),
      setBoardSubView: (view) => set({ boardSubView: view }),
      setScanResults: (results) => set({ scanResults: results }),
      setScanMineResults: (results) => set({ scanMineResults: results }),
      setTimelineData: (data) => set({ timelineData: data }),

      // Pulse state
      pulseBoard: null,
      setPulseBoard: (data) => set({ pulseBoard: data }),

      // Task log state
      selectedTaskId: null,
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),
      taskActivities: [],
      setTaskActivities: (activities) => set({ taskActivities: activities }),
      addTaskActivity: (activity) => set((s) => ({
        taskActivities: s.selectedTaskId === activity.taskId
          ? [...s.taskActivities, activity]
          : s.taskActivities,
      })),
      taskLogSummaries: {},
      setTaskLogSummaries: (summaries) => set({ taskLogSummaries: summaries }),

      // Project state
      projectBoardProjects: [],
      projectBoardUnassigned: [],
      projectBoardFields: [],
      setProjectBoard: (data) => set({
        projectBoardProjects: data.projects || [],
        projectBoardUnassigned: data.unassigned || [],
        projectBoardFields: data.fields || [],
      }),

      // Supervisor state
      supervisorTracked: [],
      setSupervisorTracked: (tracked) => set({ supervisorTracked: tracked }),
    }),
    {
      name: "maw.fleet",
      version: 3,
      storage: hybridStorage,
      partialize: (s) => ({
        recentMap: s.recentMap,
        sortMode: s.sortMode,
        grouped: s.grouped,
        collapsed: s.collapsed,
        muted: s.muted,
        stageMode: s.stageMode,
        sleptTargets: s.sleptTargets,
        lastView: s.lastView,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 1 && state.recentMap) {
          // v0→v1: recentMap was Record<string, number>, migrate to Record<string, RecentEntry>
          const old = state.recentMap as Record<string, unknown>;
          const next: Record<string, RecentEntry> = {};
          for (const [k, v] of Object.entries(old)) {
            if (typeof v === "number") continue;
            if (v && typeof v === "object" && "lastBusy" in v) next[k] = v as RecentEntry;
          }
          state.recentMap = next;
        }
        if (version < 2) {
          // v1→v2: recentMap keys used session:windowName, now use session:windowIndex
          // Drop stale entries — they'll repopulate with correct format
          state.recentMap = {};
        }
        if (version < 3) {
          // v2→v3: default stageMode to "stage" (was "pitch")
          state.stageMode = "stage";
        }
        return state;
      },
    }
  )
);

// Load asks from server on startup
setTimeout(() => {
  fetch(apiUrl("/api/asks"))
    .then((r) => r.json())
    .then((data: AskItem[]) => {
      if (Array.isArray(data) && data.length > 0) {
        useFleetStore.setState({ asks: data });
      }
    })
    .catch(() => {});
}, 0);

export const RECENT_TTL_MS = RECENT_TTL;

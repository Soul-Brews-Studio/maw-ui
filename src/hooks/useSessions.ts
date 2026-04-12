import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Session, AgentState, AgentEvent } from "../lib/types";
import type { Team } from "../components/TeamPanel";
import { apiUrl } from "../lib/api";
import { stripAnsi } from "../lib/ansi";
import { agentSortKey } from "../lib/constants";
import { playWakeSound } from "../lib/sounds";
import { useFleetStore } from "../lib/store";
import { useFeedStatusStore } from "../lib/feedStatusStore";
import { usePreviewStore } from "../lib/previewStore";
import { activeOracles, type FeedEvent, type FeedEventType } from "../lib/feed";
import type { AskType } from "../lib/types";

const BUSY_TIMEOUT = 15_000; // 15s without feed → ready
const IDLE_TIMEOUT = 60_000; // 60s without feed → idle

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const [eventLog, setEventLog] = useState<AgentEvent[]>([]);
  const MAX_EVENTS = 200;

  // Agent Teams state
  const [teams, setTeams] = useState<Team[]>([]);

  // Oracle feed state
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const feedEventsRef = useRef<FeedEvent[]>([]);
  feedEventsRef.current = feedEvents;
  const MAX_FEED = 100;

  const addEvent = useCallback((target: string, type: AgentEvent["type"], detail: string) => {
    setEventLog(prev => {
      const next = [...prev, { time: Date.now(), target, type, detail }];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  // Fallback: fetch teams via REST on mount in case the WebSocket connection
  // doesn't deliver them (race on first connect, server restart, etc.).
  // Ported from c664f95 (Casa Oracle, PR #6).
  useEffect(() => {
    fetch(apiUrl("/api/teams"))
      .then(r => r.json())
      .then(data => setTeams(data.teams || []))
      .catch(() => {});
  }, []);

  const markBusy = useFleetStore((s) => s.markBusy);
  const markSlept = useFleetStore((s) => s.markSlept);
  const clearSlept = useFleetStore((s) => s.clearSlept);

  const agentsRef = useRef<AgentState[]>([]);
  const lastSoundTime = useRef(0);

  // --- Feed-based status tracking ---
  // target → last feed timestamp, target → last event type
  const feedLastSeen = useRef<Record<string, number>>({});
  const feedLastEvent = useRef<Record<string, FeedEventType>>({});

  const FEED_BUSY_EVENTS = new Set<FeedEventType>(["PreToolUse", "PostToolUse", "UserPromptSubmit", "SubagentStart", "PostToolUseFailure"]);
  const FEED_STOP_EVENTS = new Set<FeedEventType>(["Stop", "SessionEnd", "TaskCompleted", "Notification"]);

  /** Resolve feed event → agent. Uses project field for worktree-aware matching (case-insensitive).
   *  KEY: worktree events NEVER fall back to main oracle window — prevents cross-contamination. */
  const resolveAgentFromFeed = useCallback((event: FeedEvent): AgentState | undefined => {
    const project = event.project;
    const wtMatch = project.match(/[.-]wt-(?:\d+-)?(.+)$/);
    if (wtMatch) {
      const windowName = `${event.oracle}-${wtMatch[1]}`.toLowerCase();
      // If worktree event but no matching window, return undefined — do NOT fall back to main
      return agentsRef.current.find(a => a.name.toLowerCase() === windowName);
    }
    // Only non-worktree events match by oracle name (main window)
    const oracleLower = event.oracle.toLowerCase();
    const oracleMain = oracleLower.endsWith("-oracle") ? oracleLower : `${oracleLower}-oracle`;
    return agentsRef.current.find(a => a.name.toLowerCase() === oracleMain)
      || agentsRef.current.find(a => a.name.toLowerCase() === oracleLower);
  }, []);

  const updateStatusFromFeed = useCallback((event: FeedEvent) => {
    const agent = resolveAgentFromFeed(event);
    if (!agent) return;

    const target = agent.target;
    const { setStatus, getStatus } = useFeedStatusStore.getState();

    feedLastEvent.current[target] = event.event;

    if (FEED_BUSY_EVENTS.has(event.event)) {
      feedLastSeen.current[target] = Date.now();
      const currentStatus = getStatus(target);
      if (currentStatus !== "busy") {
        // Play per-oracle wake sound on transition to busy (10s cooldown)
        const now = Date.now();
        if (now - lastSoundTime.current > 10_000) {
          lastSoundTime.current = now;
          playWakeSound(agent.name);
        }
        addEvent(target, "status", `${currentStatus} → busy`);
        clearSlept(target);
        setStatus(target, "busy");
      }
    } else if (FEED_STOP_EVENTS.has(event.event)) {
      feedLastSeen.current[target] = 0; // mark stopped
      const currentStatus = getStatus(target);
      if (currentStatus !== "ready") {
        addEvent(target, "status", `${currentStatus} → ready`);
        setStatus(target, "ready");
      }
    }
  }, [addEvent, clearSlept, resolveAgentFromFeed]);

  // Decay: busy → ready after 15s, ready → idle after 60s without feed events
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const { statuses, setStatus } = useFeedStatusStore.getState();
      for (const agent of agentsRef.current) {
        const lastSeen = feedLastSeen.current[agent.target] || 0;
        const status = statuses[agent.target];
        if (!status) continue;

        const lastEvt = feedLastEvent.current[agent.target];
        const inToolCall = lastEvt === "PreToolUse" || lastEvt === "SubagentStart";
        if (status === "busy" && lastSeen > 0 && now - lastSeen > BUSY_TIMEOUT && !inToolCall) {
          setStatus(agent.target, "ready");
        } else if (status === "ready" && (lastSeen === 0 || now - lastSeen > IDLE_TIMEOUT)) {
          setStatus(agent.target, "idle");
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // --- Ask detection from feed events ---
  const ASK_RESUME_EVENTS = new Set<FeedEventType>(["PreToolUse", "SubagentStart", "UserPromptSubmit"]);
  const lastStopMessage = useRef<Record<string, string>>({});
  const lastAskAdded = useRef<Record<string, number>>({}); // cooldown: oracle → timestamp

  const detectAsk = useCallback((event: FeedEvent) => {
    const { addAsk, dismissByOracle } = useFleetStore.getState();
    const agent = resolveAgentFromFeed(event);

    if (ASK_RESUME_EVENTS.has(event.event)) {
      const name = agent?.name || event.oracle;
      // Cooldown: don't dismiss asks added in the last 5s (prevents blink race)
      const addedAt = lastAskAdded.current[name] || 0;
      if (Date.now() - addedAt > 5000) {
        dismissByOracle(name);
      }
      delete lastStopMessage.current[name];
      return;
    }

    const oracleName = agent?.name || event.oracle;

    if (event.event === "Stop" && event.message.trim()) {
      lastStopMessage.current[oracleName] = event.message.trim();
    }

    if (event.event === "Notification") {
      const msg = event.message.toLowerCase();
      let askType: AskType | null = null;
      if (msg.includes("waiting for your input") || msg.includes("waiting for input")) askType = "input";
      else if (msg.includes("needs your attention") || msg.includes("attention")) askType = "attention";
      else if (msg.includes("needs your approval") || msg.includes("approval")) askType = "plan";
      if (askType) {
        let stopMsg = lastStopMessage.current[oracleName];
        if (!stopMsg) {
          for (let i = feedEventsRef.current.length - 1; i >= 0; i--) {
            const fe = feedEventsRef.current[i];
            if (fe.oracle === event.oracle && fe.event === "Stop" && fe.message.trim()) {
              stopMsg = fe.message.trim();
              break;
            }
          }
        }
        const displayMessage = stopMsg && stopMsg.length > event.message.length ? stopMsg : event.message;
        addAsk({ oracle: oracleName, target: agent?.target || "", type: askType, message: displayMessage });
        lastAskAdded.current[oracleName] = Date.now();
        delete lastStopMessage.current[oracleName];
      }
    }
  }, [resolveAgentFromFeed]);

  const handleMessage = useCallback((data: any) => {
    if (data.type === "sessions") {
      setSessions((data.sessions as Session[]).filter(s => !s.name.startsWith("maw-pty-")));
    } else if (data.type === "recent") {
      const agents: { target: string; name: string; session: string }[] = data.agents || [];
      if (agents.length > 0) {
        markBusy(agents);
        // Set initial "ready" status for agents detected as running Claude.
        // They may not have fired feed events yet — without this they'd render
        // as "idle" for up to BUSY_TIMEOUT seconds before the first feed event
        // bumps them to "ready". Only upgrade idle/missing — never downgrade
        // from busy/crashed.
        // Ported from c664f95 (Casa Oracle, PR #6) into the current
        // useFeedStatusStore architecture.
        const store = useFeedStatusStore.getState();
        for (const a of agents) {
          const current = store.statuses[a.target];
          if (!current || current === "idle") {
            store.setStatus(a.target, "ready");
          }
        }
      }
    } else if (data.type === "feed") {
      const feedEvent = data.event as FeedEvent;
      setFeedEvents(prev => {
        const next = [...prev, feedEvent];
        return next.length > MAX_FEED ? next.slice(-MAX_FEED) : next;
      });
      updateStatusFromFeed(feedEvent);
      detectAsk(feedEvent);
    } else if (data.type === "feed-history") {
      const events = (data.events as FeedEvent[]).slice(-MAX_FEED);
      setFeedEvents(events);
      for (const e of events) {
        updateStatusFromFeed(e);
        if (FEED_BUSY_EVENTS.has(e.event as FeedEventType)) {
          const agent = resolveAgentFromFeed(e);
          if (agent) markBusy([{ target: agent.target, name: agent.name, session: agent.session }], e.ts);
        }
      }
    } else if (data.type === "teams") {
      setTeams(data.teams || []);
    } else if (data.type === "previews") {
      // Write to preview store (separate from status — no cascade to avatars)
      const rawPreviews: Record<string, string> = data.data;
      const cleaned: Record<string, string> = {};
      for (const [target, raw] of Object.entries(rawPreviews)) {
        const text = stripAnsi(raw);
        const lines = text.split("\n").filter((l: string) => l.trim());
        const compactingLine = lines.find((l: string) => l.toLowerCase().includes("compacting"));
        cleaned[target] = (compactingLine || lines[lines.length - 1] || "").slice(0, 120);
      }
      usePreviewStore.getState().setPreviews(cleaned);
    } else if (data.type === "action-ok") {
      if (data.action === "sleep") markSlept(data.target);
      else if (data.action === "wake") clearSlept(data.target);
    }
  }, []);

  // Subscribe to statuses — agents re-derive on status change
  // Blink prevented by stable useCallback props (not by removing reactivity)
  const statuses = useFeedStatusStore((s) => s.statuses);

  const agents: AgentState[] = useMemo(() => {
    const list = sessions.flatMap((s) =>
      s.windows.map((w) => {
        const key = `${s.name}:${w.index}`;
        let project: string | undefined;
        if (w.cwd) {
          const base = w.cwd.split("/").pop() || "";
          const wtMatch = base.match(/[.-]wt-(?:\d+-)?(.+)$/);
          project = wtMatch ? `wt:${wtMatch[1]}` : base;
        }
        return {
          target: key,
          name: w.name,
          session: s.name,
          windowIndex: w.index,
          active: w.active,
          preview: "", // read from usePreviewStore at component level
          status: statuses[key] || "idle",
          project,
          cwd: w.cwd,
          source: s.source && s.source !== "local" ? s.source : undefined,
        };
      })
    );
    list.sort((a, b) => agentSortKey(a.name) - agentSortKey(b.name));
    agentsRef.current = list;
    return list;
  }, [sessions, statuses]);

  const feedActive = useMemo(() => activeOracles(feedEvents, 5 * 60_000), [feedEvents]);

  const agentFeedLog = useMemo((): Map<string, FeedEvent[]> => {
    const map = new Map<string, FeedEvent[]>();
    for (let i = feedEvents.length - 1; i >= 0; i--) {
      const e = feedEvents[i];
      const agent = agentsRef.current.length > 0 ? resolveAgentFromFeed(e) : undefined;
      const key = agent ? agent.name.replace(/-oracle$/, "") : e.oracle;
      const arr = map.get(key) || [];
      if (arr.length < 5) { arr.push(e); map.set(key, arr); }
    }
    return map;
  }, [feedEvents, resolveAgentFromFeed]);

  return { sessions, agents, eventLog, addEvent, handleMessage, feedEvents, feedActive, agentFeedLog, teams };
}

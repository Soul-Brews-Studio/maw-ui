/**
 * AppShell — shared layout for all standalone apps.
 * Provides: WebSocket connection, StatusBar, error boundary.
 * Each app mounts its view inside this shell.
 */
import { type ReactNode, useCallback, useEffect } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { useSessions } from "../hooks/useSessions";
import { useFleetStore } from "../lib/store";
import { StatusBar } from "../components/StatusBar";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { setSoundMuted } from "../lib/sounds";
import type { AgentState } from "../lib/types";

interface AppShellProps {
  /** Current view name for StatusBar highlight */
  view: string;
  /** Full-height layout (terminal, config) */
  fullHeight?: boolean;
  /** Render function — receives session data + send function */
  children: (ctx: AppContext) => ReactNode;
}

export interface AppContext {
  sessions: ReturnType<typeof useSessions>["sessions"];
  agents: ReturnType<typeof useSessions>["agents"];
  eventLog: ReturnType<typeof useSessions>["eventLog"];
  addEvent: ReturnType<typeof useSessions>["addEvent"];
  feedEvents: ReturnType<typeof useSessions>["feedEvents"];
  feedActive: ReturnType<typeof useSessions>["feedActive"];
  agentFeedLog: ReturnType<typeof useSessions>["agentFeedLog"];
  teams: ReturnType<typeof useSessions>["teams"];
  connected: boolean;
  reconnecting: boolean;
  serverError: string | null;
  send: (msg: object) => void;
  onSelectAgent: (agent: AgentState) => void;
}

export function AppShell({ view, fullHeight, children }: AppShellProps) {
  const { sessions, agents, eventLog, addEvent, handleMessage, feedEvents, feedActive, agentFeedLog, teams, serverError } = useSessions();

  const muted = useFleetStore((s) => s.muted);
  const toggleMuted = useFleetStore((s) => s.toggleMuted);
  useEffect(() => { setSoundMuted(muted); }, [muted]);

  const { connected, reconnecting, send } = useWebSocket(handleMessage);
  const askCount = useFleetStore((s) => s.asks.filter((a) => !a.dismissed).length);

  const onSelectAgent = useCallback((agent: AgentState) => {
    send({ type: "select", target: agent.target });
    // Open terminal in new tab for standalone apps
    window.open(`/terminal.html?target=${encodeURIComponent(agent.target)}&name=${encodeURIComponent(agent.name)}`, "_blank");
  }, [send]);

  const wrapperClass = fullHeight
    ? "relative flex flex-col h-screen overflow-hidden"
    : "relative min-h-screen";

  const ctx: AppContext = {
    sessions, agents, eventLog, addEvent, feedEvents, feedActive, agentFeedLog, teams,
    connected, reconnecting, serverError, send, onSelectAgent,
  };

  return (
    <ErrorBoundary>
        <div className={wrapperClass} style={{ background: "#020208" }}>
          <div className={`relative z-10${fullHeight ? " flex-shrink-0" : ""}`}>
            <StatusBar
              connected={connected}
              agentCount={agents.length}
              sessionCount={sessions.length}
              tabCount={sessions.reduce((sum, s) => sum + s.windows.length, 0)}
              activeView={view}
              onJump={() => {}}
              askCount={askCount}
              onInbox={() => { window.location.href = "/inbox.html"; }}
              muted={muted}
              onToggleMute={toggleMuted}
            />
          </div>
          {children(ctx)}
          {serverError && (
            <div className="fixed top-0 inset-x-0 z-[9999] flex justify-center pt-3 px-4 pointer-events-none">
              <div className="pointer-events-auto px-4 py-2.5 rounded-xl backdrop-blur-xl shadow-lg max-w-2xl" style={{ background: "rgba(20,5,5,0.92)", border: "1px solid rgba(239,68,68,0.4)" }}>
                <p className="font-mono text-xs font-bold" style={{ color: "#fca5a5" }}>⚠️ Live data is stale</p>
                <p className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{serverError}</p>
              </div>
            </div>
          )}
          <div
            className="fixed bottom-1 right-2 z-[9999] font-mono pointer-events-none select-none"
            style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}
            title={`v${__MAW_VERSION__} · ${__MAW_COMMIT__} · built ${__MAW_BUILD__}`}
          >
            {__MAW_COMMIT__} · {__MAW_BUILD__}
          </div>
          {reconnecting && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto text-center px-8 py-6 rounded-2xl backdrop-blur-xl" style={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="text-3xl mb-3 animate-pulse">📡</div>
                <p className="font-mono text-sm" style={{ color: "#ef4444" }}>Connection lost</p>
                <p className="font-mono text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Reconnecting...</p>
              </div>
            </div>
          )}
        </div>
    </ErrorBoundary>
  );
}

import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "../index.css";
import { useWebSocket } from "../hooks/useWebSocket";
import { apiUrl } from "../lib/api";
import { stripAnsi } from "../lib/ansi";
import type { FeedEvent } from "../lib/feed";

// ─── Types ───

interface Peer {
  url: string;
  name?: string;
  reachable: boolean;
  latency: number;
  agents?: number;
}

interface FederationStatus {
  localUrl: string;
  peers: Peer[];
  totalPeers: number;
  reachablePeers: number;
}

interface Session {
  name: string;
  windows: { index: number; name: string; active: boolean; cwd?: string }[];
  source?: string;
}

// ─── Hooks ───

function useFederation() {
  const [status, setStatus] = useState<FederationStatus | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    fetch(apiUrl("/api/federation/status"))
      .then(r => r.json())
      .then(setStatus)
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 10_000);
    return () => clearInterval(iv);
  }, [refresh]);

  return { status, error, refresh };
}

// ─── App ───

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [msgCount, setMsgCount] = useState(0);
  const { status: federation, refresh: refreshFed } = useFederation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleMessage = useCallback((data: any) => {
    setMsgCount(n => n + 1);
    if (data.type === "sessions") setSessions(data.sessions);
    else if (data.type === "feed") setFeed(prev => [...prev.slice(-199), data.event]);
    else if (data.type === "feed-history") setFeed(data.events?.slice(-100) || []);
  }, []);

  const { connected } = useWebSocket(handleMessage);

  // Derive nodes from sessions
  const nodes = useMemo(() => {
    const map = new Map<string, { name: string; sessions: Session[]; agentCount: number; source: string }>();

    // Local node
    const local = sessions.filter(s => !s.source);
    if (local.length > 0) {
      map.set("local", {
        name: "local",
        sessions: local,
        agentCount: local.reduce((sum, s) => sum + s.windows.length, 0),
        source: "local",
      });
    }

    // Remote nodes
    for (const s of sessions) {
      if (s.source && s.source !== "local") {
        const existing = map.get(s.source);
        if (existing) {
          existing.sessions.push(s);
          existing.agentCount += s.windows.length;
        } else {
          map.set(s.source, {
            name: s.source.replace(/^https?:\/\//, "").replace(/:\d+$/, ""),
            sessions: [s],
            agentCount: s.windows.length,
            source: s.source,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [sessions]);

  // Feed by oracle
  const feedByOracle = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const e of feed) {
      const arr = map.get(e.oracle) || [];
      arr.push(e);
      map.set(e.oracle, arr);
    }
    return map;
  }, [feed]);

  // Active oracles (last 5 min)
  const activeOracles = useMemo(() => {
    const cutoff = Date.now() - 5 * 60_000;
    const map = new Map<string, FeedEvent>();
    for (const e of feed) {
      if (e.ts > cutoff) map.set(e.oracle, e);
    }
    return map;
  }, [feed]);

  // Auto-scroll feed
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [feed]);

  const totalAgents = nodes.reduce((sum, n) => sum + n.agentCount, 0);
  const totalActive = activeOracles.size;

  return (
    <div className="min-h-screen" style={{ background: "#020208" }}>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.15) 0%, transparent 60%)",
        }} />
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-8">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "#a78bfa" }}>
              Federation Party
            </h1>
            <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${connected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
              {connected ? "CONNECTED" : "OFFLINE"}
            </span>
          </div>
          <p className="text-sm text-white/40 font-mono">
            {nodes.length} nodes · {totalAgents} agents · {totalActive} active · {msgCount} events
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── LEFT: Nodes ─── */}
          <div className="lg:col-span-1 space-y-4">
            <SectionTitle color="#a78bfa">Nodes ({nodes.length})</SectionTitle>

            {nodes.map(node => (
              <NodeCard
                key={node.source}
                node={node}
                peer={federation?.peers.find(p => p.url.includes(node.name))}
                activeCount={node.sessions.reduce((sum, s) =>
                  sum + s.windows.filter(w => activeOracles.has(w.name.replace(/-oracle$/, ""))).length, 0
                )}
              />
            ))}

            {/* Federation peers not yet connected */}
            {federation?.peers.filter(p => !p.reachable).map(p => (
              <div key={p.url} className="rounded-xl border p-4 opacity-40"
                style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(239,68,68,0.2)" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <span className="text-sm font-mono text-white/40">{p.name || p.url.replace(/^https?:\/\//, "")}</span>
                  <span className="text-[10px] text-red-400/60 ml-auto">offline</span>
                </div>
              </div>
            ))}

            {/* Join section */}
            <JoinCard onRefresh={refreshFed} />
          </div>

          {/* ─── CENTER: Agents Grid ─── */}
          <div className="lg:col-span-1 space-y-4">
            <SectionTitle color="#22d3ee">Agents ({totalAgents})</SectionTitle>

            <div className="space-y-1">
              {nodes.flatMap(node =>
                node.sessions.flatMap(s =>
                  s.windows.map(w => {
                    const oracleName = w.name.replace(/-oracle$/, "");
                    const latest = activeOracles.get(oracleName);
                    const isActive = !!latest;
                    const events = feedByOracle.get(oracleName) || [];
                    const lastEvent = events[events.length - 1];

                    return (
                      <div key={`${s.name}:${w.index}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-white/[0.03]"
                        style={{ borderLeft: `3px solid ${isActive ? "#22d3ee" : "transparent"}` }}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: isActive ? "#22d3ee" : "#333", boxShadow: isActive ? "0 0 6px rgba(34,211,238,0.5)" : "none" }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-white/80 truncate">{w.name}</div>
                          {lastEvent && (
                            <div className="text-[10px] font-mono text-white/25 truncate">
                              {lastEvent.event}: {lastEvent.message.slice(0, 40)}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-mono text-white/15 flex-shrink-0">
                          {node.name === "local" ? s.name : node.name}
                        </span>
                      </div>
                    );
                  })
                )
              )}
            </div>
          </div>

          {/* ─── RIGHT: Live Feed ─── */}
          <div className="lg:col-span-1 space-y-4">
            <SectionTitle color="#fbbf24">Live Feed ({feed.length})</SectionTitle>

            <div ref={scrollRef}
              className="rounded-xl border overflow-y-auto font-mono text-[10px]"
              style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)", maxHeight: "calc(100vh - 200px)" }}>
              {feed.slice(-100).map((e, i) => (
                <div key={i} className="flex gap-2 px-3 py-1 border-b hover:bg-white/[0.02]"
                  style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                  <span className="text-white/15 w-[40px] text-right flex-shrink-0">{e.timestamp.slice(14, 19)}</span>
                  <span className="font-bold flex-shrink-0 w-[85px] truncate" style={{ color: eventColor(e.event) }}>{e.event}</span>
                  <span className="font-bold flex-shrink-0 w-[80px] truncate" style={{ color: oracleColor(e.oracle) }}>{e.oracle}</span>
                  <span className="text-white/30 truncate flex-1">{e.message.slice(0, 60)}</span>
                </div>
              ))}
              {feed.length === 0 && (
                <div className="text-center py-8 text-white/15">Waiting for feed events...</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Components ───

function SectionTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color }}>{children}</span>
    </div>
  );
}

function NodeCard({ node, peer, activeCount }: {
  node: { name: string; sessions: { name: string; windows: any[] }[]; agentCount: number; source: string };
  peer?: Peer;
  activeCount: number;
}) {
  const isLocal = node.source === "local";
  const color = isLocal ? "#22c55e" : "#a78bfa";

  return (
    <div className="rounded-xl border p-4 transition-all hover:border-opacity-50"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: `${color}30` }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
          style={{ background: `${color}15` }}>
          {isLocal ? "🏠" : "🌐"}
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color }}>{node.name}</div>
          <div className="text-[10px] font-mono text-white/30">
            {node.agentCount} agents · {node.sessions.length} sessions · {activeCount} active
          </div>
        </div>
        <span className="w-3 h-3 rounded-full" style={{
          background: color,
          boxShadow: `0 0 8px ${color}60`,
          animation: "agent-pulse 2s ease-in-out infinite",
        }} />
      </div>

      {/* Session badges */}
      <div className="flex flex-wrap gap-1.5">
        {node.sessions.map(s => (
          <span key={s.name}
            className="text-[9px] font-mono px-2 py-0.5 rounded-full"
            style={{ background: `${color}10`, color: `${color}cc` }}>
            {s.name} ({s.windows.length})
          </span>
        ))}
      </div>

      {/* Ping */}
      {peer && (
        <div className="mt-2 text-[10px] font-mono text-white/20">
          ping: {peer.latency < 5000 ? `${peer.latency}ms` : "timeout"}
        </div>
      )}
    </div>
  );
}

function JoinCard({ onRefresh }: { onRefresh: () => void }) {
  const [url, setUrl] = useState("");
  const [joining, setJoining] = useState(false);
  const [result, setResult] = useState("");

  const handleJoin = useCallback(async () => {
    if (!url.trim()) return;
    setJoining(true);
    setResult("");
    try {
      const res = await fetch(apiUrl("/api/ping"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      setResult(data.ok ? `Connected! ${data.latency}ms` : `Failed: ${data.error}`);
      if (data.ok) onRefresh();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    }
    setJoining(false);
  }, [url, onRefresh]);

  return (
    <div className="rounded-xl border p-4"
      style={{ background: "rgba(168,85,247,0.04)", borderColor: "rgba(168,85,247,0.15)" }}>
      <div className="text-xs font-bold tracking-wider uppercase mb-3" style={{ color: "#a78bfa" }}>
        Join Federation
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleJoin(); }}
          placeholder="http://node.local:3456"
          className="flex-1 text-xs font-mono px-3 py-2 rounded-lg outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-clear-button]:hidden"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0", WebkitAppearance: "none" as const }}
        />
        <button
          onClick={handleJoin}
          disabled={joining}
          className="px-4 py-2 rounded-lg text-xs font-bold active:scale-95 transition-all"
          style={{ background: "rgba(168,85,247,0.2)", color: "#a78bfa" }}>
          {joining ? "..." : "Ping"}
        </button>
      </div>
      {result && (
        <div className={`text-[10px] font-mono mt-2 ${result.includes("Connected") ? "text-emerald-400" : "text-red-400"}`}>
          {result}
        </div>
      )}
    </div>
  );
}

// ─── Utils ───

const ORACLE_COLORS: Record<string, string> = {};
const PALETTE = ["#64b5f6", "#ffa726", "#ef5350", "#ab47bc", "#26c6da", "#66bb6a", "#ec407a", "#7e57c2", "#42a5f5", "#ffca28"];
let ci = 0;
function oracleColor(name: string): string {
  if (!ORACLE_COLORS[name]) ORACLE_COLORS[name] = PALETTE[ci++ % PALETTE.length];
  return ORACLE_COLORS[name];
}

function eventColor(event: string): string {
  if (event.startsWith("Pre")) return "#ffa726";
  if (event.startsWith("Post")) return "#4caf50";
  if (event === "Stop" || event === "SessionEnd") return "#ef4444";
  if (event === "UserPromptSubmit") return "#22d3ee";
  if (event === "Notification") return "#fbbf24";
  if (event === "SubagentStart") return "#a855f7";
  return "#666";
}

// ─── Mount ───
createRoot(document.getElementById("root")!).render(<App />);

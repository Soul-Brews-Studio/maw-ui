import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "../index.css";
import { useWebSocket } from "../hooks/useWebSocket";
import { apiUrl } from "../lib/api";
import type { FeedEvent, FeedEventType } from "../lib/feed";
import type { PaneStatus, Session } from "../lib/types";

// ─── Types ───

interface Agent {
  name: string;
  target: string;
  session: string;
  node: string;
  status: PaneStatus;
  lastEvent?: FeedEvent;
}

interface Node {
  name: string;
  sessions: any[];
  agents: Agent[];
  online: boolean;
  lastSeen: number;
}

// ─── Color utils ───

const NODE_COLORS: Record<string, string> = {
  white: "#22c55e",
  mba: "#a78bfa",
  vps: "#22d3ee",
};
const PALETTE = ["#64b5f6", "#ffa726", "#ef5350", "#ab47bc", "#26c6da", "#66bb6a", "#ec407a", "#7e57c2"];
let ci = 0;
function nodeColor(name: string): string {
  if (NODE_COLORS[name]) return NODE_COLORS[name];
  if (!NODE_COLORS[name]) NODE_COLORS[name] = PALETTE[ci++ % PALETTE.length];
  return NODE_COLORS[name];
}

function eventColor(event: string): string {
  if (event.startsWith("Pre")) return "#ffa726";
  if (event.startsWith("Post")) return "#4caf50";
  if (event === "Stop" || event === "SessionEnd") return "#ef4444";
  if (event === "UserPromptSubmit") return "#22d3ee";
  if (event === "Notification") return "#fbbf24";
  if (event === "SubagentStart") return "#a855f7";
  if (event === "SessionStart") return "#22c55e";
  return "#555";
}

function statusColor(s: PaneStatus): string {
  return s === "busy" ? "#ffa726" : s === "ready" ? "#4caf50" : "#333";
}

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ─── App ───

function App() {
  const [nodes, setNodes] = useState<Record<string, Node>>({});
  const [statuses, setStatuses] = useState<Record<string, PaneStatus>>({});
  const [feed, setFeed] = useState<(FeedEvent & { _node?: string })[]>([]);
  const [msgCount, setMsgCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const [sendTarget, setSendTarget] = useState("");
  const [sendText, setSendText] = useState("");
  const [sendResult, setSendResult] = useState("");
  const [filterNode, setFilterNode] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<"important" | "all">("important");
  const [now, setNow] = useState(Date.now());

  // Important events only — skip noisy Pre/PostToolUse
  const IMPORTANT_EVENTS = new Set(["UserPromptSubmit", "Stop", "Notification", "SessionStart", "SessionEnd", "SubagentStart", "SubagentStop"]);

  // Feed-based status derivation
  const BUSY_EVENTS = new Set<FeedEventType>(["PreToolUse", "PostToolUse", "UserPromptSubmit", "SubagentStart", "PostToolUseFailure"]);
  const STOP_EVENTS = new Set<FeedEventType>(["Stop", "SessionEnd", "TaskCompleted", "Notification"]);
  const feedLastSeen = useRef<Record<string, number>>({});

  // Tick for relative times + status decay
  useEffect(() => {
    const iv = setInterval(() => {
      setNow(Date.now());
      // Decay: busy → ready after 15s, ready → idle after 60s
      const now = Date.now();
      setStatuses(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [oracle, status] of Object.entries(next)) {
          const last = feedLastSeen.current[oracle] || 0;
          if (status === "busy" && last > 0 && now - last > 15_000) {
            next[oracle] = "ready";
            changed = true;
          } else if (status === "ready" && (last === 0 || now - last > 60_000)) {
            next[oracle] = "idle";
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  // WebSocket message handler
  const handleMessage = useCallback((data: any) => {
    if (data.type === "feed") {
      const event = data.event as FeedEvent;
      setMsgCount(n => n + 1);
      setFeed(prev => [...prev.slice(-149), { ...event, _node: event.host }]);
      // Derive status from feed events
      const oracleName = event.oracle;
      if (BUSY_EVENTS.has(event.event)) {
        feedLastSeen.current[oracleName] = Date.now();
        setStatuses(prev => prev[oracleName] === "busy" ? prev : { ...prev, [oracleName]: "busy" });
      } else if (STOP_EVENTS.has(event.event)) {
        feedLastSeen.current[oracleName] = 0;
        setStatuses(prev => prev[oracleName] === "ready" ? prev : { ...prev, [oracleName]: "ready" });
      }
    } else if (data.type === "feed-history") {
      const events = (data.events as FeedEvent[]).slice(-150);
      setFeed(events.map(e => ({ ...e, _node: e.host })));
      for (const event of events) {
        const oracleName = event.oracle;
        if (BUSY_EVENTS.has(event.event)) {
          feedLastSeen.current[oracleName] = event.ts;
          setStatuses(prev => ({ ...prev, [oracleName]: "busy" }));
        } else if (STOP_EVENTS.has(event.event)) {
          feedLastSeen.current[oracleName] = 0;
          setStatuses(prev => ({ ...prev, [oracleName]: "ready" }));
        }
      }
      setMsgCount(n => n + events.length);
    } else if (data.type === "sessions") {
      const sessions = (data.sessions as Session[]).filter(s => !s.name.startsWith("maw-pty-"));
      setMsgCount(n => n + 1);
      // Group sessions by source (node)
      const byNode: Record<string, Session[]> = {};
      for (const s of sessions) {
        const nodeName = s.source && s.source !== "local" ? new URL(s.source).hostname.split(".")[0] : "local";
        (byNode[nodeName] ||= []).push(s);
      }
      const nextNodes: Record<string, Node> = {};
      for (const [nodeName, nodeSessions] of Object.entries(byNode)) {
        const agents: Agent[] = nodeSessions.flatMap(s =>
          s.windows.map(w => ({
            name: w.name,
            target: `${s.name}:${w.index}`,
            session: s.name,
            node: nodeName,
            status: "idle" as PaneStatus,
          }))
        );
        nextNodes[nodeName] = { name: nodeName, sessions: nodeSessions, agents, online: true, lastSeen: Date.now() };
      }
      setNodes(nextNodes);
    }
  }, []);

  const { connected, reconnecting } = useWebSocket(handleMessage);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [feed]);

  // Merge agents from all nodes with live status
  const allAgents = useMemo(() => {
    const list: Agent[] = [];
    for (const node of Object.values(nodes)) {
      for (const agent of node.agents) {
        const oracleName = agent.name.replace(/-oracle$/, "");
        list.push({ ...agent, status: statuses[oracleName] || statuses[agent.name] || "idle" });
      }
    }
    return list;
  }, [nodes, statuses]);

  const filteredFeed = feed.filter(e => {
    if (filterNode && e.host !== filterNode && e._node !== filterNode) return false;
    if (feedMode === "important" && !IMPORTANT_EVENTS.has(e.event)) return false;
    return true;
  });

  const busyCount = allAgents.filter(a => a.status === "busy").length;
  const readyCount = allAgents.filter(a => a.status === "ready").length;
  const nodeList = Object.values(nodes);

  // Send message to agent
  const handleSend = useCallback(() => {
    if (!sendTarget || !sendText.trim()) return;
    // Use maw-js API to send
    const [node, agent] = sendTarget.includes(":") && !sendTarget.includes("/")
      ? [null, sendTarget]
      : sendTarget.split("/");

    fetch(apiUrl("/api/action"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "send", target: agent || sendTarget, text: sendText.trim() + "\r" }),
    })
      .then(r => r.json())
      .then(() => { setSendResult("sent"); setSendText(""); setTimeout(() => setSendResult(""), 2000); })
      .catch(e => { setSendResult(`error: ${e.message}`); });
  }, [sendTarget, sendText]);

  return (
    <div className="h-screen flex flex-col" style={{ background: "#020208" }}>
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌐</span>
          <h1 className="text-xl font-black tracking-tight" style={{ color: "#a78bfa" }}>Workspace</h1>
        </div>
        <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-400" : reconnecting ? "bg-amber-500/15 text-amber-400" : "bg-red-500/15 text-red-400"}`}>
          {connected ? "WS LIVE" : reconnecting ? "RECONNECTING" : "OFFLINE"}
        </span>
        <div className="flex items-center gap-3 text-[11px] font-mono text-white/25">
          <span>{nodeList.length} nodes</span>
          <span>·</span>
          <span>{allAgents.length} agents</span>
          <span>·</span>
          <span className="text-amber-400/60">{busyCount} busy</span>
          <span className="text-emerald-400/60">{readyCount} ready</span>
          <span>·</span>
          <span>{msgCount} msgs</span>
        </div>

        {/* Node filter pills */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={() => setFilterNode(null)}
            className="text-[10px] font-mono px-2 py-1 rounded-full transition-all"
            style={{ background: !filterNode ? "rgba(255,255,255,0.1)" : "transparent", color: !filterNode ? "#fff" : "rgba(255,255,255,0.3)" }}>
            All
          </button>
          {nodeList.map(n => (
            <button key={n.name}
              onClick={() => setFilterNode(filterNode === n.name ? null : n.name)}
              className="text-[10px] font-mono px-2 py-1 rounded-full transition-all flex items-center gap-1"
              style={{
                background: filterNode === n.name ? `${nodeColor(n.name)}20` : "transparent",
                color: filterNode === n.name ? nodeColor(n.name) : "rgba(255,255,255,0.3)",
              }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: nodeColor(n.name) }} />
              {n.name}
            </button>
          ))}
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Nodes + Agents */}
        <div className="w-[340px] flex-shrink-0 border-r overflow-y-auto p-4 space-y-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>

          {nodeList.length === 0 && (
            <div className="text-center py-12">
              <span className="text-3xl block mb-3">🌐</span>
              <p className="text-sm text-white/30">Waiting for nodes...</p>
              <p className="text-[10px] text-white/15 mt-1">Sessions will populate automatically</p>
            </div>
          )}

          {nodeList.map(node => {
            const color = nodeColor(node.name);
            const nodeAgents = allAgents.filter(a => a.node === node.name);
            const nodeBusy = nodeAgents.filter(a => a.status === "busy").length;

            return (
              <div key={node.name} className="rounded-xl border overflow-hidden"
                style={{ borderColor: `${color}25` }}>
                {/* Node header */}
                <div className="flex items-center gap-2 px-4 py-3" style={{ background: `${color}08` }}>
                  <span className="w-3 h-3 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}50` }} />
                  <span className="text-sm font-bold" style={{ color }}>{node.name}</span>
                  <span className="text-[10px] font-mono text-white/25 ml-auto">
                    {nodeAgents.length} agents · {nodeBusy} busy
                  </span>
                </div>

                {/* Agents */}
                <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  {nodeAgents.map(agent => {
                    const oracleName = agent.name.replace(/-oracle$/, "");
                    const latestEvent = feed.filter(e => e.oracle === oracleName).slice(-1)[0];

                    return (
                      <div key={agent.target}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-white/[0.02] cursor-pointer transition-colors"
                        onClick={() => setSendTarget(agent.target)}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                          background: statusColor(agent.status),
                          boxShadow: agent.status === "busy" ? `0 0 6px ${statusColor(agent.status)}60` : "none",
                        }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-mono text-white/80 truncate">{agent.name}</div>
                          {latestEvent && (
                            <div className="text-[9px] font-mono text-white/20 truncate">
                              {latestEvent.event}: {latestEvent.message?.slice(0, 30)}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                          background: `${statusColor(agent.status)}15`,
                          color: statusColor(agent.status),
                        }}>{agent.status}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Join workspace */}
          <JoinWorkspace />
        </div>

        {/* CENTER: Feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Feed header */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            <span className="text-[9px] font-mono text-white/20">{filteredFeed.length} events</span>
            <button onClick={() => setFeedMode(feedMode === "important" ? "all" : "important")}
              className="text-[9px] font-mono px-2 py-0.5 rounded-full ml-auto transition-all"
              style={{ background: feedMode === "important" ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.06)", color: feedMode === "important" ? "#a78bfa" : "#666" }}>
              {feedMode === "important" ? "Important" : "All events"}
            </button>
          </div>
          {/* Feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto font-mono text-[10px]">
            {filteredFeed.map((e, i) => (
              <div key={i} className="flex gap-0 px-1 border-b hover:bg-white/[0.02]"
                style={{ borderColor: "rgba(255,255,255,0.025)" }}>
                <span className="text-white/10 px-2 py-1 w-[44px] text-right flex-shrink-0">{e.timestamp?.slice(11, 19)}</span>
                <span className="px-1.5 py-1 w-[20px] flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: nodeColor(e.host || "local") }} />
                </span>
                <span className="px-1 py-1 w-[90px] flex-shrink-0 font-bold truncate" style={{ color: eventColor(e.event) }}>{e.event}</span>
                <span className="px-1 py-1 w-[100px] flex-shrink-0 text-white/60 truncate">{e.oracle}</span>
                <span className="px-1 py-1 text-white/25 truncate flex-1">{e.message?.slice(0, 80)}</span>
              </div>
            ))}
            {filteredFeed.length === 0 && (
              <div className="flex items-center justify-center h-full text-white/15 text-sm">
                {connected ? "Waiting for events..." : "Connecting..."}
              </div>
            )}
          </div>

          {/* Send bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
            <select
              value={sendTarget} onChange={e => setSendTarget(e.target.value)}
              className="text-[11px] font-mono px-2 py-1.5 rounded-lg outline-none w-[180px]"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0" }}>
              <option value="">select agent...</option>
              {allAgents.map(a => (
                <option key={`${a.node}/${a.target}`} value={a.target}>
                  {a.node !== "local" ? `${a.node}:` : ""}{a.name}
                </option>
              ))}
            </select>
            <input
              type="text" value={sendText}
              onChange={e => setSendText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
              placeholder="message..."
              className="flex-1 text-[11px] font-mono px-3 py-1.5 rounded-lg outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-clear-button]:hidden"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0", WebkitAppearance: "none" as const }}
              enterKeyHint="send"
            />
            <button onClick={handleSend}
              className="px-4 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all"
              style={{ background: sendResult === "sent" ? "rgba(34,197,94,0.2)" : "rgba(168,85,247,0.2)", color: sendResult === "sent" ? "#22c55e" : "#a78bfa" }}>
              {sendResult === "sent" ? "Sent!" : "Send"}
            </button>
          </div>
        </div>

        {/* RIGHT: Stats */}
        <div className="w-[200px] flex-shrink-0 border-l overflow-y-auto p-3 space-y-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>

          <StatSection title="By Node" color="#a78bfa">
            {nodeList.map(n => {
              const count = feed.filter(e => e.host === n.name).length;
              return (
                <StatRow key={n.name} label={n.name} count={count} color={nodeColor(n.name)}
                  onClick={() => setFilterNode(filterNode === n.name ? null : n.name)}
                  active={filterNode === n.name} />
              );
            })}
          </StatSection>

          <StatSection title="By Oracle" color="#22d3ee">
            {Object.entries(
              feed.reduce((acc, e) => { acc[e.oracle] = (acc[e.oracle] || 0) + 1; return acc; }, {} as Record<string, number>)
            ).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => (
              <StatRow key={name} label={name} count={count}
                color={statusColor(statuses[name] || "idle")}
                status={statuses[name]} />
            ))}
          </StatSection>

          <StatSection title="By Event" color="#fbbf24">
            {Object.entries(
              feed.reduce((acc, e) => { acc[e.event] = (acc[e.event] || 0) + 1; return acc; }, {} as Record<string, number>)
            ).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
              <StatRow key={name} label={name} count={count} color={eventColor(name)} />
            ))}
          </StatSection>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function JoinWorkspace() {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div className="rounded-xl border p-4" style={{ background: "rgba(168,85,247,0.04)", borderColor: "rgba(168,85,247,0.15)" }}>
      <div className="text-[10px] font-bold tracking-wider uppercase mb-3" style={{ color: "#a78bfa" }}>
        Create Workspace
      </div>
      <div className="flex gap-2">
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="workspace name..."
          className="flex-1 text-[11px] font-mono px-2 py-1.5 rounded-lg outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-clear-button]:hidden"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#e0e0e0", WebkitAppearance: "none" as const }} />
        <button
          onClick={() => {
            if (!name.trim()) return;
            setCreating(true);
            fetch(apiUrl("/api/action"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "workspace-create", name: name.trim() }),
            })
              .catch(() => {})
              .finally(() => { setCreating(false); setName(""); });
          }}
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold active:scale-95"
          style={{ background: "rgba(168,85,247,0.2)", color: "#a78bfa" }}>
          {creating ? "..." : "Create"}
        </button>
      </div>
    </div>
  );
}

function StatSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5" style={{ color: `${color}80` }}>{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function StatRow({ label, count, color, status, onClick, active }: {
  label: string; count: number; color: string; status?: PaneStatus; onClick?: () => void; active?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] ${onClick ? "cursor-pointer hover:bg-white/[0.03]" : ""}`}
      style={{ background: active ? `${color}15` : "transparent" }}
      onClick={onClick}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-white/50 truncate flex-1">{label}</span>
      {status && <span className="text-[8px] font-mono" style={{ color }}>{status}</span>}
      <span className="text-white/20 font-mono">{count}</span>
    </div>
  );
}

// ─── Mount ───
createRoot(document.getElementById("root")!).render(<App />);

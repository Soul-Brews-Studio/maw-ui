import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef } from "react";
import "../index.css";
import { useWebSocket } from "../hooks/useWebSocket";
import { apiUrl } from "../lib/api";
import { stripAnsi } from "../lib/ansi";
import type { FeedEvent } from "../lib/feed";

// ─── Raw state — no stores, no abstractions, just WebSocket data ───

interface Session {
  name: string;
  windows: { index: number; name: string; active: boolean; cwd?: string }[];
  source?: string;
}

interface Team {
  name: string;
  members: { name: string; cwd?: string; color?: string }[];
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [asks, setAsks] = useState<{ oracle: string; message: string; ts: number }[]>([]);
  const [wsMessages, setWsMessages] = useState(0);

  const handleMessage = useCallback((data: any) => {
    setWsMessages(n => n + 1);
    if (data.type === "sessions") {
      setSessions(data.sessions);
    } else if (data.type === "feed") {
      setFeed(prev => [...prev.slice(-49), data.event]);
      // Detect asks
      if (data.event.event === "Notification" && data.event.message.toLowerCase().includes("waiting")) {
        setAsks(prev => [...prev.slice(-9), { oracle: data.event.oracle, message: data.event.message, ts: Date.now() }]);
      }
    } else if (data.type === "feed-history") {
      setFeed(data.events?.slice(-50) || []);
    } else if (data.type === "previews") {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.data as Record<string, string>)) {
        const lines = stripAnsi(v).split("\n").filter((l: string) => l.trim());
        cleaned[k] = (lines[lines.length - 1] || "").slice(0, 100);
      }
      setPreviews(prev => ({ ...prev, ...cleaned }));
    } else if (data.type === "teams") {
      setTeams(data.teams || []);
    }
  }, []);

  const { connected, reconnecting, send } = useWebSocket(handleMessage);

  // Fetch sessions on mount (WS sends them periodically, not immediately)
  useEffect(() => {
    fetch(apiUrl("/api/sessions")).then(r => r.json()).then(setSessions).catch(() => {});
    fetch(apiUrl("/api/worktrees")).then(r => r.json()).then(d => setTeams(d.teams || [])).catch(() => {});
  }, []);

  // Derive agents
  const agents = sessions.flatMap(s =>
    s.windows.map(w => ({
      target: `${s.name}:${w.index}`,
      name: w.name,
      session: s.name,
      cwd: w.cwd,
      source: s.source,
    }))
  );

  // Feed-derived status
  const agentStatus: Record<string, { status: string; lastEvent: string; ts: number }> = {};
  const busyEvents = new Set(["PreToolUse", "PostToolUse", "UserPromptSubmit", "SubagentStart"]);
  const stopEvents = new Set(["Stop", "SessionEnd", "Notification"]);
  for (const e of feed) {
    const key = e.oracle;
    if (busyEvents.has(e.event)) agentStatus[key] = { status: "busy", lastEvent: e.event, ts: e.ts };
    else if (stopEvents.has(e.event)) agentStatus[key] = { status: "ready", lastEvent: e.event, ts: e.ts };
  }

  return (
    <div className="min-h-screen p-6" style={{ background: "#020208", color: "#e0e0e0" }}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-2xl font-bold tracking-wider" style={{ color: "#64b5f6" }}>maw-ui v2</h1>
        <span className={`text-xs font-mono px-2 py-1 rounded ${connected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
          {connected ? "LIVE" : reconnecting ? "RECONNECTING" : "OFFLINE"}
        </span>
        <span className="text-xs font-mono text-white/20">{wsMessages} msgs · {agents.length} agents · {sessions.length} sessions</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* ─── Module: Sessions ─── */}
        <Card title="Sessions" count={sessions.length} color="#64b5f6">
          {sessions.map(s => (
            <div key={s.name} className="mb-2">
              <div className="text-xs font-bold" style={{ color: "#64b5f6" }}>{s.name} {s.source && <span className="text-white/20">({s.source})</span>}</div>
              {s.windows.map(w => (
                <div key={w.index} className="text-[11px] text-white/50 pl-3 flex items-center gap-2">
                  <span className="text-white/70">{w.name}</span>
                  <span className="text-white/20">:{w.index}</span>
                  {w.cwd && <span className="text-white/15 truncate text-[9px]">{w.cwd.split("/").slice(-2).join("/")}</span>}
                </div>
              ))}
            </div>
          ))}
        </Card>

        {/* ─── Module: Agents + Status ─── */}
        <Card title="Agents" count={agents.length} color="#ffa726">
          {agents.map(a => {
            const st = agentStatus[a.name.replace(/-oracle$/, "")] || agentStatus[a.name];
            const isBusy = st?.status === "busy";
            return (
              <div key={a.target} className="flex items-center gap-2 py-1 border-b border-white/[0.04]">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isBusy ? "#ffa726" : st ? "#4caf50" : "#333" }} />
                <span className="text-xs font-mono text-white/80 truncate">{a.name}</span>
                <span className="text-[9px] text-white/20 ml-auto">{a.target}</span>
              </div>
            );
          })}
        </Card>

        {/* ─── Module: Feed (live events) ─── */}
        <Card title="Feed" count={feed.length} color="#22d3ee">
          <div className="max-h-[300px] overflow-y-auto">
            {[...feed].reverse().slice(0, 20).map((e, i) => (
              <div key={i} className="text-[10px] font-mono py-0.5 border-b border-white/[0.03] flex gap-2">
                <span style={{ color: eventColor(e.event) }}>{e.event.slice(0, 12)}</span>
                <span className="text-white/50">{e.oracle}</span>
                <span className="text-white/25 truncate">{e.message.slice(0, 50)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* ─── Module: Previews ─── */}
        <Card title="Previews" count={Object.keys(previews).length} color="#a855f7">
          {Object.entries(previews).map(([target, text]) => (
            <div key={target} className="mb-1.5">
              <div className="text-[10px] font-mono text-white/30">{target}</div>
              <div className="text-[11px] font-mono text-white/60 truncate">{text || "—"}</div>
            </div>
          ))}
          {Object.keys(previews).length === 0 && <Empty />}
        </Card>

        {/* ─── Module: Teams ─── */}
        <Card title="Teams" count={teams.length} color="#22c55e">
          {teams.map(t => (
            <div key={t.name} className="mb-2">
              <div className="text-xs font-bold text-emerald-400">{t.name}</div>
              {t.members.map((m, i) => (
                <div key={i} className="text-[11px] text-white/50 pl-3">{m.name}</div>
              ))}
            </div>
          ))}
          {teams.length === 0 && <Empty />}
        </Card>

        {/* ─── Module: Asks ─── */}
        <Card title="Asks" count={asks.length} color="#fbbf24">
          {asks.map((a, i) => (
            <div key={i} className="mb-1.5 text-[11px]">
              <span className="font-bold text-amber-400">{a.oracle}</span>
              <span className="text-white/50 ml-2">{a.message.slice(0, 80)}</span>
            </div>
          ))}
          {asks.length === 0 && <Empty text="No asks — agents working independently" />}
        </Card>

        {/* ─── Module: Send command ─── */}
        <SendCard agents={agents} send={send} connected={connected} />

      </div>
    </div>
  );
}

// ─── UI primitives ───

function Card({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.02)", borderColor: `${color}20` }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-xs font-bold tracking-wider uppercase" style={{ color }}>{title}</span>
        <span className="text-[10px] font-mono text-white/25 ml-auto">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ text = "No data yet" }: { text?: string }) {
  return <p className="text-[11px] text-white/15 italic">{text}</p>;
}

function SendCard({ agents, send, connected }: { agents: { target: string; name: string }[]; send: (msg: object) => void; connected: boolean }) {
  const [target, setTarget] = useState("");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <Card title="Send" count={0} color="#ef4444">
      <select
        value={target}
        onChange={e => setTarget(e.target.value)}
        className="w-full text-xs font-mono px-2 py-1.5 rounded mb-2 outline-none"
        style={{ background: "rgba(255,255,255,0.06)", color: "#e0e0e0", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <option value="">select agent...</option>
        {agents.map(a => <option key={a.target} value={a.target}>{a.name} ({a.target})</option>)}
      </select>
      <div className="flex gap-2">
        <input
          type="text" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && target && text.trim()) {
              send({ type: "send", target, text: text.trim() + "\r" });
              setSent(true); setText(""); setTimeout(() => setSent(false), 1000);
            }
          }}
          placeholder="type message..."
          className="flex-1 text-xs font-mono px-2 py-1.5 rounded outline-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-clear-button]:hidden"
          style={{ background: "rgba(255,255,255,0.06)", color: "#e0e0e0", border: "1px solid rgba(255,255,255,0.08)", WebkitAppearance: "none" as const }}
        />
        <button
          onClick={() => { if (target && text.trim()) { send({ type: "send", target, text: text.trim() + "\r" }); setSent(true); setText(""); setTimeout(() => setSent(false), 1000); } }}
          disabled={!connected || !target}
          className="px-3 py-1.5 rounded text-xs font-bold active:scale-95"
          style={{ background: sent ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.15)", color: sent ? "#22c55e" : "#ef4444" }}
        >{sent ? "Sent" : "Send"}</button>
      </div>
    </Card>
  );
}

function eventColor(event: string): string {
  if (event.startsWith("Pre")) return "#ffa726";
  if (event.startsWith("Post")) return "#4caf50";
  if (event === "Stop" || event === "SessionEnd") return "#ef4444";
  if (event === "UserPromptSubmit") return "#22d3ee";
  if (event === "Notification") return "#fbbf24";
  return "#666";
}

// ─── Mount ───
createRoot(document.getElementById("root")!).render(<App />);

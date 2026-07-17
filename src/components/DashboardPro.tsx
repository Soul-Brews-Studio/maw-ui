import { useState, useEffect, useCallback } from "react";
import { apiUrl, isRemote } from "../lib/api";
import { isVisible } from "../lib/visibility";
import { useWebSocket } from "../hooks/useWebSocket";

// Read-only mode: hide mutation controls when viewing remotely (hosted HTTPS).
// Local users (same-origin) get full control. Remote viewers see data only.
const READONLY = isRemote;

// ---- Types (grounded against real API responses) -------------------------

interface Peer {
  url: string;
  reachable: boolean;
  latency: number;
  node?: string;
  agents?: string[];
  clockDeltaMs?: number;
  clockWarning?: boolean;
}

interface FedStatus {
  localUrl: string;
  peers: Peer[];
  totalPeers: number;
  reachablePeers: number;
  clockHealth?: { clockUtc: string; timezone: string; uptimeSeconds: number };
}

interface Plugin {
  name: string;
  // Old v2 runtime shape (pre-alpha.x)
  type?: string;
  source?: string;
  events?: number;
  errors?: number;
  lastEvent?: string;
  // New catalog shape (alpha.x+)
  version?: string;
  api?: { path: string; methods: string[] };
}

interface PluginStatus {
  startedAt: string;
  plugins: Plugin[];
}

interface FeedEvent {
  event: string;
  oracle: string;
  message?: string;
  timestamp?: string;
}

interface Session {
  name: string;
  windows: Array<{ name: string; active: boolean; repo?: string }>;
}

// Fleet comms digest (from the `digest` plugin at /api/digest).
interface DigestResult {
  windowLabel: string;
  source: string;
  llm: string;
  totalMessages: number;
  agents: string[];
  summary: string;
  conversations: Array<{ pair: string; count: number; summary: string }>;
  blocked: string[];
  pendingDone: string[];
  attention: string[];
  costs: Array<{ name: string; cost: number; tokens: number }>;
}

// ---- Data hook -----------------------------------------------------------

function useDashboardData() {
  const [fed, setFed] = useState<FedStatus | null>(null);
  const [plugins, setPlugins] = useState<PluginStatus | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [loading, setLoading] = useState(true);

  // Live feed via WebSocket — instant updates, no polling
  const handleWsMessage = useCallback((data: any) => {
    if (data.type === "feed" && data.event) {
      setFeed((prev) => [data.event as FeedEvent, ...prev].slice(0, 50));
    } else if (data.type === "feed-history" && data.events) {
      setFeed((prev) => {
        const combined = [...(data.events as FeedEvent[]).reverse(), ...prev];
        return combined.slice(0, 50);
      });
    }
  }, []);

  const { connected: wsConnected } = useWebSocket(handleWsMessage);

  const refresh = useCallback(async () => {
    const [fedRes, plugRes, sessRes] = await Promise.allSettled([
      fetch(apiUrl("/api/federation/status")).then((r) => (r.ok ? r.json() : null)),
      fetch(apiUrl("/api/plugins")).then((r) => (r.ok ? r.json() : null)),
      fetch(apiUrl("/api/sessions")).then((r) => (r.ok ? r.json() : null)),
    ]);
    if (fedRes.status === "fulfilled" && fedRes.value) setFed(fedRes.value);
    if (plugRes.status === "fulfilled" && plugRes.value) setPlugins(plugRes.value);
    if (sessRes.status === "fulfilled" && sessRes.value) {
      const s = Array.isArray(sessRes.value) ? sessRes.value : sessRes.value.sessions ?? [];
      setSessions(s);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Poll federation/plugins/sessions every 30s (less frequent — feed is live via WS now)
    const iv = setInterval(() => { if (isVisible()) refresh(); }, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Comms digest — fetched on its own cadence (it may run an LLM) so it never blocks core panels.
  useEffect(() => {
    const loadDigest = () => {
      if (!isVisible()) return;
      fetch(apiUrl("/api/digest"))
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setDigest(d as DigestResult))
        .catch(() => {});
    };
    loadDigest();
    const iv = setInterval(loadDigest, 120_000);
    return () => clearInterval(iv);
  }, []);

  return { fed, plugins, feed, sessions, digest, loading, refresh, wsConnected };
}

// ---- Panels --------------------------------------------------------------

function PeerHealthPanel({ fed }: { fed: FedStatus | null }) {
  if (!fed) return <PanelShell title="Peers" subtitle="loading..." />;
  return (
    <PanelShell title="Peers" subtitle={`${fed.reachablePeers}/${fed.totalPeers} reachable`}>
      <div className="space-y-1.5">
        {fed.peers.map((p) => (
          <div key={p.url} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: p.reachable ? "#22c55e" : "#ef4444" }}
              />
              <span className="text-white/70">{p.node || p.url.replace(/^https?:\/\//, "")}</span>
              {p.agents && <span className="text-white/30">({p.agents.length})</span>}
            </div>
            <span className="text-white/40 font-mono">
              {p.reachable ? `${p.latency}ms` : "offline"}
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function ClockDriftPanel({ fed }: { fed: FedStatus | null }) {
  if (!fed) return <PanelShell title="Clock" subtitle="loading..." />;
  const ch = fed.clockHealth;
  return (
    <PanelShell
      title="Clock Health"
      subtitle={ch ? `up ${formatUptime(ch.uptimeSeconds)}` : "no data"}
    >
      <div className="space-y-1.5">
        {ch && (
          <div className="text-xs text-white/40 mb-2">
            {ch.timezone} &middot; {new Date(ch.clockUtc).toLocaleTimeString()}
          </div>
        )}
        {fed.peers.map((p) => {
          const drift = p.clockDeltaMs;
          const warn = p.clockWarning;
          return (
            <div key={p.url} className="flex items-center justify-between text-xs">
              <span className="text-white/70">{p.node || "?"}</span>
              <span
                className="font-mono"
                style={{ color: warn ? "#f59e0b" : drift != null ? "#22c55e" : "#666" }}
              >
                {drift != null ? `${drift > 0 ? "+" : ""}${drift}ms` : "—"}
                {warn && " ⚠"}
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function AgentGridPanel({ sessions, onRefresh }: { sessions: Session[]; onRefresh: () => void }) {
  const [acting, setActing] = useState<string | null>(null);
  const total = sessions.reduce((n, s) => n + s.windows.length, 0);

  const wakeAgent = async (name: string) => {
    setActing(name);
    try {
      await fetch(apiUrl("/api/wake"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: name }),
      });
      setTimeout(onRefresh, 2000);
    } catch {}
    setActing(null);
  };

  const sleepAgent = async (name: string) => {
    setActing(name);
    try {
      await fetch(apiUrl("/api/sleep"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: name }),
      });
      setTimeout(onRefresh, 2000);
    } catch {}
    setActing(null);
  };

  return (
    <PanelShell title="Agents" subtitle={`${total} across ${sessions.length} sessions`}>
      <div className="flex flex-wrap gap-1">
        {sessions.flatMap((s) =>
          s.windows.map((w) =>
            READONLY ? (
              <span
                key={`${s.name}-${w.name}-${w.repo ?? ""}`}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                style={{
                  backgroundColor: w.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                  color: w.active ? "#22c55e" : "rgba(255,255,255,0.3)",
                }}
              >
                {w.name.replace(/-oracle$/, "")}
              </span>
            ) : (
              <button
                key={`${s.name}-${w.name}-${w.repo ?? ""}`}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer hover:ring-1 hover:ring-white/20 transition-all"
                style={{
                  backgroundColor: w.active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                  color: acting === w.name ? "#f59e0b" : w.active ? "#22c55e" : "rgba(255,255,255,0.3)",
                }}
                title={w.active ? `Click to sleep ${w.name}` : `Click to wake ${w.name}`}
                onClick={() => w.active ? sleepAgent(w.name) : wakeAgent(w.name)}
                disabled={acting !== null}
              >
                {acting === w.name ? "..." : w.name.replace(/-oracle$/, "")}
              </button>
            ),
          ),
        )}
      </div>
    </PanelShell>
  );
}

function PluginPanel({ plugins }: { plugins: PluginStatus | Plugin[] | null }) {
  if (!plugins) return <PanelShell title="Plugins" subtitle="loading..." />;
  // /api/plugins shape drifted in maw-js alpha.x: used to return {plugins:[{events,errors}]},
  // now returns flat [{name,version,api}] catalog. Handle both.
  const list = Array.isArray(plugins) ? plugins : plugins.plugins ?? [];
  const hasRuntimeStats = list.length > 0 && typeof list[0].events === "number";
  const totalEvents = hasRuntimeStats ? list.reduce((n, p) => n + (p.events ?? 0), 0) : 0;
  const totalErrors = hasRuntimeStats ? list.reduce((n, p) => n + (p.errors ?? 0), 0) : 0;
  return (
    <PanelShell
      title="Plugins"
      subtitle={hasRuntimeStats
        ? `${list.length} loaded · ${totalEvents} events${totalErrors > 0 ? ` · ${totalErrors} errors` : ""}`
        : `${list.length} loaded`}
    >
      <div className="space-y-1">
        {list.map((p: any) => (
          <div key={p.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: (p.errors ?? 0) > 0 ? "#ef4444" : "#22c55e" }}
              />
              <span className="text-white/60">{p.name.replace(/\.ts$/, "")}</span>
              <span className="text-white/20 text-[10px]">{p.source ?? p.version ?? ""}</span>
            </div>
            {hasRuntimeStats && (
              <span className="text-white/40 font-mono text-[10px]">
                {p.events}ev{p.errors > 0 && <span className="text-red-400 ml-1">{p.errors}err</span>}
              </span>
            )}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function LiveFeedPanel({ feed }: { feed: FeedEvent[] }) {
  return (
    <PanelShell title="Live Feed" subtitle={`${feed.length} recent events`}>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {feed.length === 0 && <div className="text-xs text-white/20">no events yet</div>}
        {feed.map((e, i) => (
          <div key={i} className="text-[10px] leading-tight">
            <span className="text-white/30">{e.event}</span>{" "}
            <span className="text-cyan-400/70">{e.oracle?.replace(/-oracle$/, "")}</span>
            {e.message && (
              <span className="text-white/20 ml-1">
                {e.message.length > 80 ? e.message.slice(0, 80) + "…" : e.message}
              </span>
            )}
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

function DigestList({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5">
      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tone }}>
        {label}
      </div>
      <ul className="space-y-0.5 list-disc list-inside">
        {items.slice(0, 6).map((it, i) => (
          <li key={i} className="text-xs text-white/60 leading-snug">{it}</li>
        ))}
      </ul>
    </div>
  );
}

function DigestPanel({ digest }: { digest: DigestResult | null }) {
  if (!digest) return <PanelShell title="Comms Digest 🌈" subtitle="loading…" />;
  const d = digest;
  return (
    <PanelShell
      title="Comms Digest 🌈"
      subtitle={`${d.windowLabel} · ${d.totalMessages} msgs · ${d.agents.length} agents · ${d.llm}`}
    >
      <div className="text-xs text-white/70 leading-relaxed mb-1">{d.summary}</div>
      <DigestList label="⚠️ attention" items={d.attention} tone="#f59e0b" />
      <DigestList label="🚧 blocked / waiting" items={d.blocked} tone="#ef4444" />
      <DigestList label="✅ claimed done (verify)" items={d.pendingDone} tone="#22c55e" />
      {d.conversations.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">conversations</div>
          <div className="space-y-1">
            {d.conversations.slice(0, 8).map((c) => (
              <div key={c.pair} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-white/60 whitespace-nowrap">
                  {c.pair} <span className="text-white/25">({c.count})</span>
                </span>
                <span className="text-white/40 text-right">{c.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.costs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
          {d.costs.slice(0, 6).map((c) => (
            <span key={c.name} className="text-[10px] text-white/40 font-mono">
              {c.name.replace(/-oracle$/, "")}: ${c.cost.toFixed(2)}
            </span>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

// ---- Shell ---------------------------------------------------------------

function PanelShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/60">{title}</span>
        {subtitle && <span className="text-[10px] text-white/30">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

// ---- Main ----------------------------------------------------------------

export default function DashboardPro() {
  const { fed, plugins, feed, sessions, digest, loading, refresh, wsConnected } = useDashboardData();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white/90">Dashboard Pro</h2>
          <span
            className="text-[10px] px-2 py-0.5 rounded border"
            style={{
              color: wsConnected ? "#22c55e" : "#f59e0b",
              borderColor: wsConnected ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)",
            }}
          >
            {loading ? "loading..." : wsConnected ? "live" : "polling"}
          </span>
        </div>
        <button
          onClick={refresh}
          className="px-2 py-1 text-xs rounded border border-white/10 text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PeerHealthPanel fed={fed} />
        <ClockDriftPanel fed={fed} />
        <AgentGridPanel sessions={sessions} onRefresh={refresh} />
        <PluginPanel plugins={plugins} />
      </div>

      <DigestPanel digest={digest} />

      <LiveFeedPanel feed={feed} />
    </div>
  );
}

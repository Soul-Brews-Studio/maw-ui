import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../lib/apiFetch";
import { agentColor, agentIcon } from "../lib/constants";
import { useWebSocket } from "../hooks/useWebSocket";

interface OracleHealth {
  name: string;
  lastSeen: string;
  totalSessions: number;
  crashes: number;
  lastCrash: string | null;
  events: number;
}

interface AuditEntry {
  timestamp?: string;
  action?: string;
  event?: string;
  oracle?: string;
  session?: string;
  message?: string;
  [key: string]: any;
}

interface SnapshotSummary {
  file: string;
  timestamp: string;
  trigger: string;
  sessionCount: number;
  windowCount: number;
}

interface HealthSnapshot {
  ts: number;
  timestamp: string;
  memAvailMb: number;
  memTotalMb: number;
  memUsedPct: number;
  diskUsedPct: number;
  diskAvailGb: number;
  loadAvg: string;
  cpuCount: number;
  pm2Online: number;
  pm2Total: number;
  dockerRunning: number;
  dockerTotal: number;
  alertFired: number;
  alertReason: string | null;
}

function timeAgo(ts: string | number): string {
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 0 || isNaN(diff)) return "—";
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function HealthCard({ oracle }: { oracle: OracleHealth }) {
  const isHealthy = oracle.crashes === 0;
  const color = agentColor(oracle.name + "-oracle");
  const statusColor = isHealthy ? "#22c55e" : "#ef4444";

  return (
    <div className="rounded-xl sm:rounded-2xl p-4 sm:p-5 transition-all" style={{
      background: isHealthy ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
      border: `1px solid ${isHealthy ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
    }}>
      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-base sm:text-lg font-bold shrink-0" style={{ background: `${color}22`, border: `2px solid ${color}` }}>
          {agentIcon(oracle.name + "-oracle")}
        </div>
        <div className="flex-1">
          <h3 className="font-mono font-bold" style={{ color }}>{oracle.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="w-2 h-2 rounded-full" style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
            <span className="font-mono text-xs" style={{ color: statusColor }}>{isHealthy ? "HEALTHY" : `${oracle.crashes} CRASH${oracle.crashes > 1 ? "ES" : ""}`}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sessions" value={String(oracle.totalSessions)} />
        <Stat label="Events" value={String(oracle.events)} />
        <Stat label="Last seen" value={oracle.lastSeen ? timeAgo(oracle.lastSeen) : "—"} />
        <Stat label="Last crash" value={oracle.lastCrash ? timeAgo(oracle.lastCrash) : "never"} color={oracle.lastCrash ? "#ef4444" : "#22c55e"} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "rgba(0,0,0,0.2)" }}>
      <div className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</div>
      <div className="font-mono text-sm font-bold" style={{ color: color || "rgba(255,255,255,0.7)" }}>{value}</div>
    </div>
  );
}

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="font-mono text-xs text-center py-8" style={{ color: "rgba(255,255,255,0.25)" }}>No audit entries</p>;
  }

  return (
    <div className="space-y-1 max-h-96 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02]">
          <span className="font-mono text-[10px] shrink-0 w-16" style={{ color: "rgba(255,255,255,0.25)" }}>
            {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}
          </span>
          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{
            background: entry.action === "wake" || entry.event === "SessionStart" ? "rgba(34,197,94,0.1)" :
                        entry.action === "crash" || entry.event === "Error" ? "rgba(239,68,68,0.1)" :
                        "rgba(255,255,255,0.04)",
            color: entry.action === "wake" || entry.event === "SessionStart" ? "#86efac" :
                   entry.action === "crash" || entry.event === "Error" ? "#fca5a5" : "rgba(255,255,255,0.5)",
          }}>
            {entry.action || entry.event || "log"}
          </span>
          <span className="font-mono text-xs truncate flex-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            {entry.oracle || entry.session || ""} {entry.message ? `— ${entry.message}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function SnapshotList({ snapshots }: { snapshots: SnapshotSummary[] }) {
  if (snapshots.length === 0) {
    return <p className="font-mono text-xs text-center py-8" style={{ color: "rgba(255,255,255,0.25)" }}>No snapshots</p>;
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {snapshots.map((s) => (
        <div key={s.file} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02]">
          <span className="text-sm">📸</span>
          <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{timeAgo(s.timestamp)}</span>
          <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.08)", color: "#c084fc" }}>{s.trigger}</span>
          <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{s.sessionCount}s / {s.windowCount}w</span>
        </div>
      ))}
    </div>
  );
}

function MiniBar({ value, max, color, warn }: { value: number; max: number; color: string; warn?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const isWarn = warn !== undefined && value >= warn;
  const barColor = isWarn ? "#ef4444" : color;
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
    </div>
  );
}

function ServerHealth({ snapshots }: { snapshots: HealthSnapshot[] }) {
  if (snapshots.length === 0) {
    return <p className="font-mono text-xs text-center py-8" style={{ color: "rgba(255,255,255,0.25)" }}>No health data yet — waiting for first heartbeat</p>;
  }

  const latest = snapshots[0];
  const load1 = parseFloat(latest.loadAvg.split(" ")[0] || "0");

  // Build mini timeline (last 24h, reversed to chronological)
  const timeline = [...snapshots].reverse();

  return (
    <div className="space-y-6">
      {/* Current Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>MEMORY</div>
          <div className="font-mono text-xl font-bold mb-1" style={{ color: latest.memUsedPct > 85 ? "#ef4444" : "#22c55e" }}>
            {latest.memUsedPct}%
          </div>
          <MiniBar value={latest.memUsedPct} max={100} color="#8b5cf6" warn={85} />
          <div className="font-mono text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            {latest.memAvailMb} MB free / {latest.memTotalMb} MB
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>DISK</div>
          <div className="font-mono text-xl font-bold mb-1" style={{ color: latest.diskUsedPct > 90 ? "#ef4444" : "#22c55e" }}>
            {latest.diskUsedPct}%
          </div>
          <MiniBar value={latest.diskUsedPct} max={100} color="#3b82f6" warn={90} />
          <div className="font-mono text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            {latest.diskAvailGb} GB free
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>LOAD</div>
          <div className="font-mono text-xl font-bold mb-1" style={{ color: load1 > latest.cpuCount ? "#ef4444" : "#22c55e" }}>
            {latest.loadAvg.split(" ")[0]}
          </div>
          <MiniBar value={load1} max={latest.cpuCount * 2} color="#f59e0b" warn={latest.cpuCount} />
          <div className="font-mono text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            {latest.loadAvg} / {latest.cpuCount} CPUs
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="font-mono text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>SERVICES</div>
          <div className="font-mono text-xl font-bold mb-1" style={{ color: "#22c55e" }}>
            {latest.pm2Online + latest.dockerRunning}
          </div>
          <div className="flex gap-3 mt-1">
            <div className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              PM2: {latest.pm2Online}/{latest.pm2Total}
            </div>
            <div className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              Docker: {latest.dockerRunning}/{latest.dockerTotal}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="font-mono text-[10px] mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
          TIMELINE — last {snapshots.length} snapshots
        </div>

        {/* Memory timeline */}
        <div className="mb-4">
          <div className="font-mono text-[10px] mb-1" style={{ color: "#8b5cf6" }}>MEM %</div>
          <div className="flex items-end gap-px h-12">
            {timeline.map((s, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all min-w-[2px]"
                style={{
                  height: `${s.memUsedPct}%`,
                  background: s.memUsedPct > 85 ? "#ef4444" : "#8b5cf6",
                  opacity: 0.6,
                }}
                title={`${new Date(s.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — ${s.memUsedPct}%`}
              />
            ))}
          </div>
        </div>

        {/* Disk timeline */}
        <div className="mb-4">
          <div className="font-mono text-[10px] mb-1" style={{ color: "#3b82f6" }}>DISK %</div>
          <div className="flex items-end gap-px h-12">
            {timeline.map((s, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all min-w-[2px]"
                style={{
                  height: `${s.diskUsedPct}%`,
                  background: s.diskUsedPct > 90 ? "#ef4444" : "#3b82f6",
                  opacity: 0.6,
                }}
                title={`${new Date(s.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — ${s.diskUsedPct}%`}
              />
            ))}
          </div>
        </div>

        {/* Load timeline */}
        <div>
          <div className="font-mono text-[10px] mb-1" style={{ color: "#f59e0b" }}>LOAD</div>
          <div className="flex items-end gap-px h-12">
            {timeline.map((s, i) => {
              const l = parseFloat(s.loadAvg.split(" ")[0] || "0");
              const maxLoad = s.cpuCount * 2;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-all min-w-[2px]"
                  style={{
                    height: `${Math.min(100, (l / maxLoad) * 100)}%`,
                    background: l > s.cpuCount ? "#ef4444" : "#f59e0b",
                    opacity: 0.6,
                  }}
                  title={`${new Date(s.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} — ${l}`}
                />
              );
            })}
          </div>
        </div>

        <div className="flex justify-between mt-2">
          <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.15)" }}>
            {timeline.length > 0 ? new Date(timeline[0].ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          <span className="font-mono text-[9px]" style={{ color: "rgba(255,255,255,0.15)" }}>
            {timeline.length > 0 ? new Date(timeline[timeline.length - 1].ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        </div>
      </div>

      {/* Alert History */}
      {snapshots.some(s => s.alertFired) && (
        <div className="rounded-2xl p-5" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <div className="font-mono text-[10px] mb-3" style={{ color: "#ef4444" }}>ALERTS</div>
          <div className="space-y-1">
            {snapshots.filter(s => s.alertFired).slice(0, 10).map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {new Date(s.ts).toLocaleString("en-GB", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="font-mono text-xs" style={{ color: "#fca5a5" }}>{s.alertReason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="font-mono text-[10px] text-right" style={{ color: "rgba(255,255,255,0.15)" }}>
        Last updated: {new Date(latest.ts).toLocaleString("en-GB")}
      </div>
    </div>
  );
}

export function MonitoringView() {
  const [oracles, setOracles] = useState<OracleHealth[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [healthHistory, setHealthHistory] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"health" | "server" | "audit" | "snapshots">("health");

  const fetchTab = useCallback(async (activeTab?: string) => {
    const t = activeTab || tab;
    if (t === "health" || loading) {
      const res = await apiFetch<{ oracles: OracleHealth[] }>("/api/monitoring/health").catch(() => ({ oracles: [] }));
      setOracles(res.oracles || []);
    }
    if (t === "audit" || loading) {
      const res = await apiFetch<{ entries: AuditEntry[] }>("/api/monitoring/audit?limit=100").catch(() => ({ entries: [] }));
      setAudit(res.entries || []);
    }
    if (t === "snapshots" || loading) {
      const res = await apiFetch<{ snapshots: SnapshotSummary[] }>("/api/snapshots?limit=20").catch(() => ({ snapshots: [] }));
      setSnapshots(res.snapshots || []);
    }
    if (t === "server" || loading) {
      const res = await apiFetch<{ snapshots: HealthSnapshot[] }>("/api/health/history?hours=24").catch(() => ({ snapshots: [] }));
      setHealthHistory(res.snapshots || []);
    }
    setLoading(false);
  }, [tab, loading]);

  // Initial load: fetch all tabs
  useEffect(() => { fetchTab(); }, []);

  // Real-time: refetch on feed events via WebSocket (replaces 30s polling)
  const fetchTabRef = useRef(fetchTab);
  fetchTabRef.current = fetchTab;
  const handleWsMessage = useCallback((msg: any) => {
    if (msg.type === "feed" || msg.type === "maw-log") {
      fetchTabRef.current();
    }
  }, []);
  useWebSocket(handleWsMessage);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📡</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Loading monitoring data...</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "health" as const, label: "Health", count: oracles.length },
    { id: "server" as const, label: "Server", count: healthHistory.length },
    { id: "audit" as const, label: "Audit Log", count: audit.length },
    { id: "snapshots" as const, label: "Snapshots", count: snapshots.length },
  ];

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono" style={{ color: "#e2e8f0" }}>Monitoring</h1>
          <p className="font-mono text-[10px] sm:text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {oracles.length} oracle{oracles.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <button
          onClick={() => fetchTab()}
          className="px-3 sm:px-4 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 cursor-pointer min-h-[44px] sm:min-h-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 sm:mb-6 p-1 rounded-xl overflow-x-auto scrollbar-hide" style={{ background: "rgba(255,255,255,0.03)", WebkitOverflowScrolling: "touch" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 px-2 sm:px-4 rounded-lg font-mono text-[11px] sm:text-xs transition-all cursor-pointer whitespace-nowrap min-h-[44px] sm:min-h-0"
            style={{
              background: tab === t.id ? "rgba(168,85,247,0.12)" : "transparent",
              color: tab === t.id ? "#c084fc" : "rgba(255,255,255,0.4)",
              border: tab === t.id ? "1px solid rgba(168,85,247,0.2)" : "1px solid transparent",
            }}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "health" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {oracles.map(o => <HealthCard key={o.name} oracle={o} />)}
        </div>
      )}

      {tab === "server" && (
        <ServerHealth snapshots={healthHistory} />
      )}

      {tab === "audit" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <AuditLog entries={audit} />
        </div>
      )}

      {tab === "snapshots" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <SnapshotList snapshots={snapshots} />
        </div>
      )}
    </div>
  );
}

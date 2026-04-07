import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";
import { agentColor } from "../lib/constants";
import { AgentAvatar } from "./AgentAvatar";

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
    <div className="rounded-2xl p-5 transition-all" style={{
      background: isHealthy ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)",
      border: `1px solid ${isHealthy ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
    }}>
      <div className="flex items-center gap-3 mb-4">
        <AgentAvatar name={oracle.name + "-oracle"} size={40} />
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

export function MonitoringView() {
  const [oracles, setOracles] = useState<OracleHealth[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"health" | "audit" | "snapshots">("health");

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
    setLoading(false);
  }, [tab, loading]);

  // Initial load: fetch all tabs
  useEffect(() => { fetchTab(); }, []);

  // Auto-refresh active tab every 30s
  useEffect(() => {
    const interval = setInterval(() => fetchTab(tab), 30_000);
    return () => clearInterval(interval);
  }, [tab, fetchTab]);

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
    { id: "audit" as const, label: "Audit Log", count: audit.length },
    { id: "snapshots" as const, label: "Snapshots", count: snapshots.length },
  ];

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-mono" style={{ color: "#e2e8f0" }}>Monitoring</h1>
          <p className="font-mono text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {oracles.length} oracle{oracles.length !== 1 ? "s" : ""} tracked · auto-refresh 30s
          </p>
        </div>
        <button
          onClick={() => fetchTab()}
          className="px-4 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 px-4 rounded-lg font-mono text-xs transition-all cursor-pointer"
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

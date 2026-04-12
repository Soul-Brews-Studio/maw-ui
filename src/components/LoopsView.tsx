import { useState, useEffect, useCallback } from "react";

interface LoopStatus {
  id: string;
  oracle: string;
  description: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  lastStatus?: "ok" | "skipped" | "error";
  lastReason?: string;
  nextRun?: string;
}

interface LoopExecution {
  loopId: string;
  ts: string;
  status: "ok" | "skipped" | "error";
  reason?: string;
}

function formatTime(iso?: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatNextRun(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "overdue";
  if (diff < 60_000) return "< 1m";
  if (diff < 3600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `in ${Math.floor(diff / 3600_000)}h`;
  return d.toLocaleDateString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function cronToHuman(cron: string): string {
  const [min, hour, , , dow] = cron.split(" ");
  if (min.startsWith("*/")) return `every ${min.slice(2)}m`;
  const hours = hour.split(",");
  const dowMap: Record<string, string> = { "0": "Sun", "1": "Mon", "2": "Tue", "3": "Wed", "4": "Thu", "5": "Fri", "6": "Sat" };
  const dayPart = dow !== "*" ? ` ${dow.split(",").map(d => dowMap[d] || d).join(",")}` : " daily";
  if (hours.length === 1) return `${hours[0]}:${min.padStart(2, "0")}${dayPart}`;
  return `${hours.join(",")}h${dayPart}`;
}

const STATUS_ICON: Record<string, { color: string; label: string }> = {
  ok: { color: "#22c55e", label: "OK" },
  skipped: { color: "#eab308", label: "SKIP" },
  error: { color: "#ef4444", label: "ERR" },
};

export function LoopsView({ connected }: { connected: boolean }) {
  const [loops, setLoops] = useState<LoopStatus[]>([]);
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [history, setHistory] = useState<LoopExecution[]>([]);
  const [selectedLoop, setSelectedLoop] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);

  const fetchLoops = useCallback(() => {
    fetch("/api/loops")
      .then(r => {
        // Guard r.json() with r.ok — without this, a 404 from a maw-js
        // that doesn't have /api/loops returns plain text "404 Not Found"
        // and JSON.parse blows up at position 4 ('N' after parsing '404').
        if (!r.ok) return null;
        return r.json();
      })
      .then(data => {
        if (!data) { setLoading(false); return; }
        setLoops(data.loops || []);
        setEngineEnabled(data.enabled);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchHistory = useCallback((loopId?: string) => {
    const url = loopId ? `/api/loops/history?loopId=${loopId}&limit=30` : "/api/loops/history?limit=50";
    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setHistory(Array.isArray(data) ? data.reverse() : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLoops();
    fetchHistory();
    const interval = setInterval(() => { fetchLoops(); fetchHistory(selectedLoop || undefined); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchLoops, fetchHistory, selectedLoop]);

  const toggleEngine = () => {
    const next = !engineEnabled;
    fetch("/api/loops/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).then(() => { setEngineEnabled(next); fetchLoops(); });
  };

  const toggleLoop = (loopId: string, enabled: boolean) => {
    fetch("/api/loops/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loopId, enabled }),
    }).then(() => fetchLoops());
  };

  const triggerLoop = (loopId: string) => {
    setTriggering(loopId);
    fetch("/api/loops/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loopId }),
    }).then(() => {
      setTimeout(() => { setTriggering(null); fetchLoops(); fetchHistory(selectedLoop || undefined); }, 2000);
    }).catch(() => setTriggering(null));
  };

  const selectLoop = (id: string) => {
    const next = selectedLoop === id ? null : id;
    setSelectedLoop(next);
    fetchHistory(next || undefined);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-white/40 text-sm">Loading loops...</span>
      </div>
    );
  }

  const okCount = loops.filter(l => l.lastStatus === "ok").length;
  const errCount = loops.filter(l => l.lastStatus === "error").length;
  const skipCount = loops.filter(l => l.lastStatus === "skipped").length;
  const neverCount = loops.filter(l => !l.lastRun).length;

  return (
    <div className="px-3 sm:px-6 md:px-8 py-4 sm:py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-lg font-bold text-white/90 tracking-wide">Loop Engine</h2>
        <button
          onClick={toggleEngine}
          className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95"
          style={{
            background: engineEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: engineEnabled ? "#22c55e" : "#ef4444",
            border: `1px solid ${engineEnabled ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}
        >
          {engineEnabled ? "ENABLED" : "DISABLED"}
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-white/40">
          {okCount > 0 && <span style={{ color: "#22c55e" }}>{okCount} ok</span>}
          {errCount > 0 && <span style={{ color: "#ef4444" }}>{errCount} err</span>}
          {skipCount > 0 && <span style={{ color: "#eab308" }}>{skipCount} skip</span>}
          {neverCount > 0 && <span className="text-white/30">{neverCount} pending</span>}
          <button
            onClick={() => { fetchLoops(); fetchHistory(selectedLoop || undefined); }}
            className="px-2 py-1 rounded text-white/50 hover:text-white/80 transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Loop Cards */}
      <div className="space-y-2">
        {loops.map((loop) => {
          const st = loop.lastStatus ? STATUS_ICON[loop.lastStatus] : null;
          const isSelected = selectedLoop === loop.id;
          const isFiring = triggering === loop.id;

          return (
            <div key={loop.id}>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all hover:bg-white/[0.04]"
                style={{
                  background: isSelected ? "rgba(34,211,238,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isSelected ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.06)"}`,
                }}
                onClick={() => selectLoop(loop.id)}
              >
                {/* Status dot */}
                <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{
                  background: !loop.enabled ? "#6b7280" : st ? st.color : "#6b728050",
                  boxShadow: st && loop.enabled ? `0 0 8px ${st.color}40` : "none",
                }} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white/90 truncate">{loop.id}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{
                      background: "rgba(139,92,246,0.15)",
                      color: "#a78bfa",
                      border: "1px solid rgba(139,92,246,0.2)",
                    }}>{loop.oracle}</span>
                    {!loop.enabled && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.06] text-white/30">disabled</span>
                    )}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5 truncate">{loop.description}</div>
                </div>

                {/* Schedule */}
                <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-xs font-mono text-white/50">{cronToHuman(loop.schedule)}</span>
                  <span className="text-[10px] text-white/30">
                    {loop.lastRun ? `last: ${formatTime(loop.lastRun)}` : "never ran"}
                  </span>
                </div>

                {/* Next run */}
                <div className="hidden md:flex flex-col items-end gap-0.5 flex-shrink-0 w-20">
                  <span className="text-xs text-cyan-400/70">{formatNextRun(loop.nextRun)}</span>
                  {st && (
                    <span className="text-[10px]" style={{ color: st.color }}>{st.label}{loop.lastReason ? `: ${loop.lastReason.slice(0, 20)}` : ""}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); triggerLoop(loop.id); }}
                    disabled={isFiring || !loop.enabled}
                    className="px-2 py-1 rounded-lg text-xs transition-all active:scale-95 disabled:opacity-30"
                    style={{ background: "rgba(34,211,238,0.1)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)" }}
                  >
                    {isFiring ? "..." : "Fire"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleLoop(loop.id, !loop.enabled); }}
                    className="px-2 py-1 rounded-lg text-xs transition-all active:scale-95"
                    style={{
                      background: loop.enabled ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
                      color: loop.enabled ? "#ef4444" : "#22c55e",
                      border: `1px solid ${loop.enabled ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)"}`,
                    }}
                  >
                    {loop.enabled ? "Off" : "On"}
                  </button>
                </div>
              </div>

              {/* Expanded: History */}
              {isSelected && (
                <div className="ml-8 mt-1 mb-2 rounded-lg overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="px-3 py-2 text-xs text-white/50 border-b border-white/[0.04]">
                    Execution History — {loop.id}
                  </div>
                  {history.filter(h => !selectedLoop || h.loopId === selectedLoop).length === 0 ? (
                    <div className="px-3 py-4 text-xs text-white/30 text-center">No executions yet</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto">
                      {history.filter(h => !selectedLoop || h.loopId === selectedLoop).map((h, i) => {
                        const hst = STATUS_ICON[h.status];
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-white/[0.02] last:border-0">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: hst.color }} />
                            <span className="text-white/50 font-mono w-36 flex-shrink-0">
                              {new Date(h.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                            <span style={{ color: hst.color }} className="font-mono w-10">{hst.label}</span>
                            {h.reason && <span className="text-white/30 truncate">{h.reason}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All History */}
      {!selectedLoop && history.length > 0 && (
        <div className="mt-6 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-4 py-3 text-sm font-semibold text-white/70 border-b border-white/[0.06]">
            Recent Executions
          </div>
          <div className="max-h-64 overflow-y-auto">
            {history.map((h, i) => {
              const hst = STATUS_ICON[h.status];
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: hst.color }} />
                  <span className="text-white/50 font-mono w-36 flex-shrink-0">
                    {new Date(h.ts).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className="text-white/80 font-semibold w-40 truncate">{h.loopId}</span>
                  <span style={{ color: hst.color }} className="font-mono w-10">{hst.label}</span>
                  {h.reason && <span className="text-white/30 truncate">{h.reason}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

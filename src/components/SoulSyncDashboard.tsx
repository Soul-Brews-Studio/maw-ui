import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";

interface SyncChild {
  name: string;
  status: "connected" | "missing";
  diff: { key: string; parent: any; child: any }[];
  config?: any;
}

interface SyncTree {
  parent: { name: string; config: any };
  children: SyncChild[];
}

const STATUS_COLORS = {
  connected: { color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)" },
  missing: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)" },
  syncing: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.25)" },
};

export function SoulSyncDashboard() {
  const [tree, setTree] = useState<SyncTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<string[] | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch<{ tree: SyncTree | null }>("/api/fleet/soul-sync-status");
      setTree(data.tree || null);
    } catch { setTree(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSync = async (targets?: string[]) => {
    setSyncing(targets?.[0] || "all");
    setSyncResult(null);
    try {
      const data = await apiFetch<{ synced?: string[]; fields?: string[] }>("/api/fleet/soul-sync", {
        method: "POST",
        body: JSON.stringify({ targets }),
      });
      setSyncResult(`Synced: ${data.synced?.join(", ") || "none"} (${data.fields?.length || 0} fields)`);
      fetchStatus();
    } catch (e: any) {
      setSyncResult(`Error: ${e.message}`);
    }
    setSyncing(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🔄</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Loading soul-sync status...</p>
        </div>
      </div>
    );
  }

  if (!tree) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">🔮</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>No fleet tree found</p>
          <p className="font-mono text-xs mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>Configure parent/child relationships in fleet configs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold font-mono" style={{ color: "#e2e8f0" }}>Soul Sync</h1>
          <p className="font-mono text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Parent/child config synchronization</p>
        </div>
        <button
          onClick={() => setConfirmTarget([])}
          disabled={!!syncing}
          className="px-5 py-2.5 rounded-xl font-mono text-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc" }}
        >
          {syncing === "all" ? "Syncing..." : "Sync All"}
        </button>
      </div>

      {/* Confirmation dialog */}
      {confirmTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setConfirmTarget(null)}>
          <div className="rounded-2xl p-6 max-w-sm w-full mx-4" style={{ background: "#0a0a0f", border: "1px solid rgba(168,85,247,0.2)" }} onClick={e => e.stopPropagation()}>
            <h3 className="font-mono font-bold text-lg mb-2" style={{ color: "#e2e8f0" }}>Confirm Sync</h3>
            <p className="font-mono text-sm mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>
              Sync parent config to <span style={{ color: "#c084fc" }}>{confirmTarget.length ? confirmTarget.join(", ") : "all children"}</span>? This will overwrite child configs.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmTarget(null)} className="px-4 py-2 rounded-xl font-mono text-sm cursor-pointer" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>Cancel</button>
              <button onClick={() => { const t = confirmTarget.length ? confirmTarget : undefined; setConfirmTarget(null); handleSync(t); }} className="px-4 py-2 rounded-xl font-mono text-sm cursor-pointer" style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", color: "#c084fc" }}>Sync</button>
            </div>
          </div>
        </div>
      )}

      {/* Sync result toast */}
      {syncResult && (
        <div className="mb-6 px-4 py-3 rounded-xl font-mono text-sm" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", color: "#86efac" }}>
          {syncResult}
        </div>
      )}

      {/* Parent Hub */}
      <div className="mb-8">
        <div className="rounded-2xl p-6" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔮</span>
            <div>
              <h2 className="font-mono font-bold" style={{ color: "#c084fc" }}>{tree.parent.name}</h2>
              <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>PARENT</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(tree.parent.config).filter(([k]) => k !== "_file" && k !== "name").map(([key, val]) => (
              <div key={key} className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{key}</span>
                <div className="font-mono text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {typeof val === "object" ? JSON.stringify(val).slice(0, 60) : String(val)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connection lines visual */}
      <div className="flex justify-center mb-4">
        <div className="w-px h-8" style={{ background: "rgba(168,85,247,0.3)" }} />
      </div>

      {/* Children */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tree.children.map((child) => {
          const sc = STATUS_COLORS[child.status];
          const isSyncing = syncing === child.name;
          return (
            <div key={child.name} className="rounded-2xl p-5 transition-all" style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: sc.color, boxShadow: `0 0 6px ${sc.color}` }} />
                  <h3 className="font-mono font-bold" style={{ color: sc.color }}>{child.name}</h3>
                </div>
                <button
                  onClick={() => setConfirmTarget([child.name])}
                  disabled={!!syncing}
                  className="px-3 py-1 rounded-lg font-mono text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                >
                  {isSyncing ? "..." : "Sync"}
                </button>
              </div>

              {child.status === "missing" ? (
                <p className="font-mono text-xs" style={{ color: "rgba(239,68,68,0.7)" }}>Config not found</p>
              ) : child.diff.length === 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm">✓</span>
                  <span className="font-mono text-xs" style={{ color: "rgba(34,197,94,0.7)" }}>In sync</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="font-mono text-xs" style={{ color: "rgba(251,191,36,0.7)" }}>{child.diff.length} difference{child.diff.length > 1 ? "s" : ""}</span>
                  {child.diff.map((d) => (
                    <div key={d.key} className="rounded-lg px-3 py-2" style={{ background: "rgba(0,0,0,0.2)" }}>
                      <div className="font-mono text-xs font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>{d.key}</div>
                      <div className="flex gap-4 mt-1">
                        <div className="flex-1">
                          <span className="font-mono text-[10px]" style={{ color: "rgba(168,85,247,0.5)" }}>parent</span>
                          <div className="font-mono text-xs truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
                            {typeof d.parent === "object" ? JSON.stringify(d.parent).slice(0, 40) : String(d.parent ?? "—")}
                          </div>
                        </div>
                        <div className="flex-1">
                          <span className="font-mono text-[10px]" style={{ color: sc.color + "80" }}>child</span>
                          <div className="font-mono text-xs truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
                            {typeof d.child === "object" ? JSON.stringify(d.child).slice(0, 40) : String(d.child ?? "—")}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

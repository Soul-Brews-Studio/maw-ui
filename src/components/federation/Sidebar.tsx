import { useState, useEffect, useRef } from "react";
import { useFederationStore } from "./store";
import { machineColor, statusGlow } from "./colors";

const clean = (s: string) => s.replace(/-view$/, "").replace(/-oracle$/, "");
const label = (name: string, agentIds: Set<string>) =>
  name === "user" ? "user" : agentIds.has(name) ? `${name} oracle` : name;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

type Tab = "agents" | "messages";

export function Sidebar() {
  const { agents, edges, machines, statuses, selected, setSelected, liveMessages, messageLog, clearMessages } = useFederationStore();
  const [tab, setTab] = useState<Tab>("agents");
  const prevLiveCount = useRef(liveMessages.length);

  // Auto-switch to messages tab when new live message arrives
  useEffect(() => {
    if (liveMessages.length > prevLiveCount.current) {
      setTab("messages");
    }
    prevLiveCount.current = liveMessages.length;
  }, [liveMessages.length]);

  const selAgent = agents.find(a => a.id === selected);
  const selEdges = edges.filter(e => e.source === selected || e.target === selected);
  const lineageEdges = edges.filter(e => e.type === "lineage");

  const agentMachine = new Map(agents.map(a => [a.id, a.node]));
  const agentIds = new Set(agents.map(a => a.id));

  // Merge messages
  const allMessages = [...liveMessages.map(m => ({
    from: clean(m.from), to: clean(m.to), msg: "", ts: m.ts, live: true,
  })), ...messageLog.filter(m =>
    !liveMessages.some(l => clean(l.from) === m.from && clean(l.to) === m.to && Math.abs(l.ts - m.ts) < 5000)
  )].sort((a, b) => b.ts - a.ts);

  return (
    <div className="w-[240px] flex-shrink-0 border-l overflow-hidden flex flex-col"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(3,10,24,0.98)" }}>

      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <button onClick={() => setTab("agents")}
          className={`flex-1 py-1.5 text-[9px] font-mono tracking-wider cursor-pointer transition-colors ${tab === "agents" ? "text-cyan-400/70" : "text-white/20 hover:text-white/40"}`}
          style={tab === "agents" ? { borderBottom: "1px solid rgba(0,245,212,0.3)" } : {}}>
          AGENTS
        </button>
        <button onClick={() => setTab("messages")}
          className={`flex-1 py-1.5 text-[9px] font-mono tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${tab === "messages" ? "text-cyan-400/70" : "text-white/20 hover:text-white/40"}`}
          style={tab === "messages" ? { borderBottom: "1px solid rgba(0,245,212,0.3)" } : {}}>
          {liveMessages.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
          MSG
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === "messages" ? (
          /* Messages tab */
          allMessages.length > 0 ? (
            <div className="space-y-0">
              {allMessages.map((m, i) => {
                const isUser = m.from === "user";
                const fromColor = isUser ? "#fee440" : machineColor(agentMachine.get(m.from) || "");
                const toColor = isUser ? "#fee440" : machineColor(agentMachine.get(m.to) || "");
                return (
                  <div key={i}
                    className={`flex items-center gap-1.5 py-[3px] hover:bg-white/[0.02] rounded transition-colors ${m.live || (Date.now() - m.ts < 300000) ? "" : "opacity-60"}`}
                    title={m.msg || undefined}>
                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: m.live ? fromColor : "rgba(255,255,255,0.1)" }} />
                    <span className="text-[9px] font-mono truncate" style={{ color: `${fromColor}99` }}>{label(m.from, agentIds)}</span>
                    <span className="text-[8px] text-white/15 flex-shrink-0">{"\u2192"}</span>
                    <span className="text-[9px] font-mono truncate" style={{ color: `${toColor}99` }}>{label(m.to, agentIds)}</span>
                    <span className="text-[8px] font-mono text-white/15 ml-auto flex-shrink-0 tabular-nums">{timeAgo(m.ts)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[9px] text-white/15 text-center py-4">waiting for maw hey...</p>
          )
        ) : selAgent ? (
          /* Selected agent */
          <>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full"
                  style={{ background: machineColor(selAgent.node), boxShadow: `0 0 8px ${machineColor(selAgent.node)}50` }} />
                <span className="text-sm font-bold text-white/80">{selAgent.id}</span>
              </div>
              <div className="text-[10px] font-mono text-white/40 space-y-0.5 ml-5">
                <div>Machine: <span style={{ color: machineColor(selAgent.node) }}>{selAgent.node}</span></div>
                <div>Status: <span style={{ color: statusGlow(statuses[selAgent.id] || "idle") }}>{statuses[selAgent.id] || "idle"}</span></div>
                {selAgent.buddedFrom && <div>Budded from: <span className="text-cyan-400/60">{selAgent.buddedFrom}</span></div>}
                {selAgent.children.length > 0 && <div>Children: <span className="text-cyan-400/60">{selAgent.children.join(", ")}</span></div>}
              </div>
            </div>

            {selAgent.syncPeers.length > 0 && (
              <div>
                <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5 text-white/40">Sync Peers</div>
                {selAgent.syncPeers.map(p => (
                  <div key={p} className="flex items-center gap-2 px-2 py-1 text-[10px] font-mono cursor-pointer hover:bg-white/[0.03] rounded"
                    onClick={() => setSelected(p)}>
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: machineColor(agents.find(a => a.id === p)?.node || "") }} />
                    <span className="text-white/40">{p}</span>
                    <span className="text-[8px] ml-auto" style={{ color: statusGlow(statuses[p] || "idle") }}>
                      {statuses[p] || "idle"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {selEdges.filter(e => e.type === "message").length > 0 && (
              <div>
                <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5" style={{ color: "rgba(0,245,212,0.5)" }}>Messages</div>
                {selEdges.filter(e => e.type === "message").map(e => {
                  const peer = e.source === selAgent.id ? e.target : e.source;
                  return (
                    <div key={peer} className="flex items-center gap-2 px-2 py-1 text-[10px] font-mono cursor-pointer hover:bg-white/[0.03] rounded"
                      onClick={() => setSelected(peer)}>
                      <span className="text-white/40">{e.source === selAgent.id ? "\u2192" : "\u2190"} {peer}</span>
                      <span className="text-white/15 ml-auto">{e.count}x</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Agent list */
          <>
            <p className="text-[10px] text-white/40 mb-1">Click an agent node</p>
            <p className="text-[9px] text-white/20 mb-3">Scroll to zoom &middot; Drag to pan</p>
            {machines.map(m => {
              const mAgents = agents.filter(a => a.node === m);
              return (
                <div key={m} className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full"
                      style={{ background: machineColor(m), boxShadow: `0 0 6px ${machineColor(m)}40` }} />
                    <span className="text-[11px] font-mono font-bold" style={{ color: machineColor(m) }}>{m}</span>
                    <span className="text-[9px] font-mono text-white/30 ml-auto">{mAgents.length}</span>
                  </div>
                  {mAgents.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-0.5 text-[10px] font-mono cursor-pointer hover:bg-white/[0.05] rounded"
                      onClick={() => setSelected(a.id)}>
                      <span className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: statusGlow(statuses[a.id] || "idle"),
                          boxShadow: `0 0 4px ${statusGlow(statuses[a.id] || "idle")}60`,
                        }} />
                      <span className="text-white/50">{a.id}</span>
                    </div>
                  ))}
                </div>
              );
            })}

            {lineageEdges.length > 0 && (
              <div className="mt-4">
                <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5 text-cyan-400/50">Lineage</div>
                {lineageEdges.map((l, i) => (
                  <div key={i} className="text-[9px] font-mono text-white/30 px-2 py-0.5">{l.source} &rarr; {l.target}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

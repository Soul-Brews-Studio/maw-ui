import { useFederationStore } from "./store";
import { machineColor, statusGlow } from "./colors";

export function Sidebar() {
  const { agents, edges, machines, statuses, selected, setSelected } = useFederationStore();

  const selAgent = agents.find(a => a.id === selected);
  const selEdges = edges.filter(e => e.source === selected || e.target === selected);
  const lineageEdges = edges.filter(e => e.type === "lineage");

  return (
    <div className="w-[240px] flex-shrink-0 border-l overflow-y-auto p-4 space-y-4"
      style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(3,10,24,0.98)" }}>

      {selAgent ? (
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
        <div>
          <p className="text-[10px] text-white/40 mb-1">Click an agent node</p>
          <p className="text-[9px] text-white/20 mb-4">Scroll to zoom &middot; Drag to pan</p>
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
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useFederationStore } from "./store";
import { machineColor } from "./colors";

const clean = (s: string) => s.replace(/-view$/, "").replace(/-oracle$/, "");

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function PluginPanel() {
  const { liveMessages, messageLog, agents } = useFederationStore();
  const [collapsed, setCollapsed] = useState(false);

  // Build agent→machine lookup for coloring
  const agentMachine = new Map(agents.map(a => [a.id, a.node]));

  // Merge live + history, deduplicate, sort newest first
  const allMessages = [...liveMessages.map(m => ({
    from: clean(m.from),
    to: clean(m.to),
    msg: "",
    ts: m.ts,
    live: true,
  })), ...messageLog.filter(m => {
    return !liveMessages.some(l =>
      clean(l.from) === m.from && clean(l.to) === m.to && Math.abs(l.ts - m.ts) < 5000);
  })].sort((a, b) => b.ts - a.ts);

  const liveCount = allMessages.filter(m => m.live).length;

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer hover:bg-white/[0.05] transition-all"
        style={{ background: "rgba(3,10,24,0.9)", borderColor: "rgba(255,255,255,0.08)" }}>
        {liveMessages.length > 0
          ? <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: "0 0 8px rgba(0,245,212,0.4)" }} />
          : <span className="w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />}
        <span className="text-[10px] font-mono text-white/50">{allMessages.length} messages</span>
      </button>
    );
  }

  return (
    <div className="absolute top-[60px] left-4 bottom-4 w-[260px] rounded-lg border overflow-hidden flex flex-col"
      style={{
        background: "rgba(3,10,24,0.95)",
        borderColor: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.03] border-b transition-colors"
        style={{ borderColor: "rgba(255,255,255,0.04)" }}
        onClick={() => setCollapsed(true)}>
        {liveMessages.length > 0
          ? <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ boxShadow: "0 0 8px rgba(0,245,212,0.4)" }} />
          : <span className="w-2 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />}
        <span className="text-[10px] font-mono font-bold tracking-wide" style={{ color: "rgba(0,245,212,0.6)" }}>
          MESSAGES
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          {liveCount > 0 && (
            <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,245,212,0.1)", color: "rgba(0,245,212,0.5)" }}>
              {liveCount} live
            </span>
          )}
          <span className="text-[8px] font-mono text-white/20">{allMessages.length}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {allMessages.length > 0 ? (
          allMessages.map((m, i) => {
            const isUser = m.from === "user";
            const fromColor = isUser ? "#fee440" : machineColor(agentMachine.get(m.from) || "");
            const toColor = isUser ? "#fee440" : machineColor(agentMachine.get(m.to) || "");

            return (
              <div key={i}
                className={`flex items-center gap-1.5 px-3 py-[3px] hover:bg-white/[0.02] transition-colors ${m.live ? "" : "opacity-40"}`}
                title={m.msg || undefined}>
                <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: m.live ? fromColor : "rgba(255,255,255,0.1)" }} />
                <span className="text-[9px] font-mono truncate" style={{ color: `${fromColor}99` }}>{m.from}</span>
                <span className="text-[8px] text-white/15 flex-shrink-0">{"\u2192"}</span>
                <span className="text-[9px] font-mono truncate" style={{ color: `${toColor}99` }}>{m.to}</span>
                <span className="text-[8px] font-mono text-white/15 ml-auto flex-shrink-0 tabular-nums">{timeAgo(m.ts)}</span>
              </div>
            );
          })
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-[9px] font-mono text-white/15">waiting for maw hey...</span>
          </div>
        )}
      </div>
    </div>
  );
}

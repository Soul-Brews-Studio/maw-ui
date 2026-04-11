import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { useSessions } from "../hooks/useSessions";
import { useFleetStore } from "../lib/store";
import { agentColor } from "../lib/constants";
import { ChibiPortrait } from "./ChibiPortrait";
import { useFileAttach, FileInput, AttachmentChips } from "../hooks/useFileAttach";
import { useDevice } from "../hooks/useDevice";
import { FULL_COMMANDS } from "../quickCommands";
import type { AgentState } from "../lib/types";

// --- Status colors ---
const STATUS = {
  busy: { color: "#fdd835", bg: "rgba(253,216,53,0.12)", label: "BUSY" },
  ready: { color: "#4caf50", bg: "rgba(76,175,80,0.12)", label: "READY" },
  idle: { color: "#666", bg: "rgba(102,102,102,0.08)", label: "IDLE" },
};

// --- Agent Mini Card (touch-friendly 44px+ targets) ---
function AgentCard({ agent, selected, onSelect }: { agent: AgentState; selected: boolean; onSelect: () => void }) {
  const color = agentColor(agent.name);
  const st = STATUS[agent.status] || STATUS.idle;
  const name = agent.name.replace(/-oracle$/i, "").replace(/-/g, " ");

  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2 w-full rounded-xl transition-all active:scale-95"
      style={{
        padding: "10px 12px",
        minHeight: 52,
        background: selected ? `${color}18` : "rgba(255,255,255,0.02)",
        border: `1.5px solid ${selected ? color + "50" : "rgba(255,255,255,0.06)"}`,
        boxShadow: selected ? `0 0 12px ${color}15` : "none",
      }}
    >
      <div className="relative flex-shrink-0">
        <ChibiPortrait name={agent.name} size={44} status={agent.status} />
        <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2" style={{ background: st.color, borderColor: "#0a0a0f", boxShadow: agent.status === "busy" ? `0 0 6px ${st.color}` : "none" }} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-xs font-semibold text-white/80 truncate capitalize">{name}</div>
        <div className="text-[10px] text-white/30 truncate">{agent.preview?.slice(0, 40) || st.label}</div>
      </div>
    </button>
  );
}

// --- Fleet Sidebar ---
function FleetSidebar({ agents, selectedAgent, onSelectAgent, collapsed }: {
  agents: AgentState[];
  selectedAgent: AgentState | null;
  onSelectAgent: (a: AgentState) => void;
  collapsed?: boolean;
}) {
  const busyCount = agents.filter(a => a.status === "busy").length;
  const readyCount = agents.filter(a => a.status === "ready").length;

  if (collapsed) {
    // Compact strip — just dots
    return (
      <div className="flex flex-wrap gap-1.5 px-3 py-2 items-center" style={{ background: "rgba(0,0,0,0.3)" }}>
        {agents.map(a => {
          const st = STATUS[a.status] || STATUS.idle;
          const sel = selectedAgent?.target === a.target;
          return (
            <button key={a.target} onClick={() => onSelectAgent(a)}
              className="relative rounded-lg active:scale-90 transition-transform"
              style={{ background: sel ? agentColor(a.name) + "20" : "transparent", padding: 2, border: sel ? `1px solid ${agentColor(a.name)}40` : "1px solid transparent" }}>
              <ChibiPortrait name={a.name} size={32} status={a.status} />
              <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full" style={{ background: st.color, boxShadow: a.status === "busy" ? `0 0 4px ${st.color}` : "none" }} />
            </button>
          );
        })}
        <span className="text-[10px] text-white/30 ml-1">{busyCount}B {readyCount}R</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#08080e", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div className="px-3 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="text-sm font-bold text-cyan-400 tracking-wider">FLEET</span>
        <span className="ml-auto text-[10px] text-white/30">{busyCount}B {readyCount}R {agents.length - busyCount - readyCount}I</span>
      </div>
      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1" style={{ overscrollBehavior: "contain" }}>
        {agents.map(a => (
          <AgentCard key={a.target} agent={a} selected={selectedAgent?.target === a.target} onSelect={() => onSelectAgent(a)} />
        ))}
      </div>
    </div>
  );
}

// --- Terminal Panel (touch-optimized) ---
function TerminalPanel({ agent, send }: { agent: AgentState; send: (msg: object) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef("");
  const color = agentColor(agent.name);
  const name = agent.name.replace(/-oracle$/i, "");
  const { uploading, attachments, inputRef: fileRef, pickFile, onFileChange, removeAttachment, clearAttachments, buildMessage, drag, onPaste } = useFileAttach();

  // Poll capture
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`/api/capture?target=${encodeURIComponent(agent.target)}`);
        const data = await res.json();
        if (active && data.content !== contentRef.current) {
          contentRef.current = data.content || "";
          const el = termRef.current;
          if (el) {
            // Simple ANSI strip for display
            el.textContent = contentRef.current.replace(/\x1b\[[0-9;]*m/g, "");
            requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
          }
        }
      } catch {}
      if (active) timer = setTimeout(poll, 1500);
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [agent.target]);

  const handleSend = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const val = buildMessage(input.value);
    send({ type: "send", target: agent.target, text: val ? val + "\r" : "\r" });
    input.value = "";
    clearAttachments();
    input.focus();
  }, [agent.target, send]);

  const quickCmd = useCallback((text: string) => {
    send({ type: "send", target: agent.target, text });
  }, [agent.target, send]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: "#0e0e18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <ChibiPortrait name={agent.name} size={48} status={agent.status} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold capitalize" style={{ color }}>{name}</div>
          <div className="text-[10px] text-white/30 font-mono">{agent.target}</div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full" style={{ background: STATUS[agent.status]?.bg, color: STATUS[agent.status]?.color }}>
          <div className="w-2 h-2 rounded-full" style={{ background: STATUS[agent.status]?.color }} />
          <span className="text-[10px] font-bold">{STATUS[agent.status]?.label}</span>
        </div>
      </div>

      {/* Terminal output */}
      <div ref={termRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed text-[#cdd6f4] whitespace-pre-wrap"
        style={{ background: "#08080c", overscrollBehavior: "contain", touchAction: "pan-y", wordBreak: "break-word" }}
      />

      {/* Quick commands — touch-friendly 48px buttons */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 overflow-x-auto" style={{ background: "#0a0a12", borderTop: "1px solid rgba(255,255,255,0.04)", touchAction: "pan-x" }}>
        {FULL_COMMANDS.map(cmd => (
          <button key={cmd.label} onClick={() => {
            if (cmd.action === "restart") { if (confirm(`Restart ${name}?`)) send({ type: "restart", target: agent.target }); }
            else if (cmd.action) send({ type: cmd.action, target: agent.target });
            else quickCmd(cmd.text);
          }}
            className="shrink-0 rounded-xl font-mono active:scale-90 transition-transform"
            style={{ padding: "10px 16px", minHeight: 44, minWidth: 48, background: `${cmd.color}12`, color: cmd.color, border: `1px solid ${cmd.color}25`, fontSize: 12 }}>
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex-shrink-0" style={{ background: "#0e0e18", borderTop: "1px solid rgba(255,255,255,0.06)" }} onPaste={onPaste} {...drag}>
        <FileInput inputRef={fileRef} onChange={onFileChange} />
        {(attachments.length > 0 || uploading) && (
          <div className="px-4 pt-2">
            <AttachmentChips attachments={attachments} onRemove={removeAttachment} uploading={uploading} />
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={pickFile} className="text-white/30 hover:text-cyan-400 transition-colors shrink-0" title="Attach file">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <span className="text-cyan-400 font-bold font-mono text-lg shrink-0">❯</span>
          <textarea ref={inputRef as any} defaultValue=""
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            onChange={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
            rows={1}
            className="flex-1 bg-transparent text-white/90 outline-none font-mono resize-none"
            style={{ caretColor: "#22d3ee", fontSize: 16, minHeight: 44, maxHeight: 120, overflowY: "auto" }}
            inputMode="text" enterKeyHint="send" spellCheck={false} autoComplete="off" placeholder="talk to oracle..."
          />
          <button onClick={handleSend}
            className="shrink-0 rounded-xl bg-cyan-500 text-black font-bold active:bg-cyan-600 transition-colors"
            style={{ padding: "12px 20px", fontSize: 14, minHeight: 48 }}>
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Project & Task Panel (iPad-optimized) ---
function ProjectTaskPanel({ send }: { send: (msg: object) => void }) {
  const items = useFleetStore(s => s.boardItems);
  const loading = useFleetStore(s => s.boardLoading);
  const [projects, setProjects] = useState<any[]>([]);
  const [subView, setSubView] = useState<"projects" | "tasks">("tasks");

  useEffect(() => {
    send({ type: "board" });
    fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.projects || [])).catch(() => {});
  }, [send]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof items> = {};
    for (const item of items) {
      const status = item.status || "No Status";
      if (!groups[status]) groups[status] = [];
      groups[status].push(item);
    }
    return groups;
  }, [items]);

  const statusOrder = ["In Progress", "Todo", "Backlog", "Done"];
  const statusColor: Record<string, string> = { "In Progress": "#fdd835", "Todo": "#22d3ee", "Backlog": "#666", "Done": "#4caf50" };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0" style={{ background: "#0e0e18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex gap-1 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
          {(["tasks", "projects"] as const).map(v => (
            <button key={v} onClick={() => setSubView(v)}
              className="px-4 py-2 rounded-md text-xs font-bold transition-all capitalize"
              style={{ minHeight: 40, background: subView === v ? "rgba(34,211,238,0.15)" : "transparent", color: subView === v ? "#22d3ee" : "rgba(255,255,255,0.4)" }}>
              {v}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-white/30 ml-auto">{items.length} tasks</span>
        <button onClick={() => { send({ type: "board" }); fetch("/api/projects").then(r => r.json()).then(d => setProjects(d.projects || [])).catch(() => {}); }}
          className="px-3 py-2 rounded-lg text-xs text-white/40 active:scale-95" style={{ background: "rgba(255,255,255,0.04)", minHeight: 44 }}>
          Refresh
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ overscrollBehavior: "contain" }}>
        {loading && <div className="text-center text-white/30 py-8">Loading...</div>}

        {subView === "projects" && (
          <>
            {projects.length === 0 && <div className="text-center text-white/20 py-8">No projects</div>}
            {projects.map((p: any) => (
              <div key={p.id} className="rounded-xl px-4 py-4 mb-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-sm font-bold text-white/80">{p.name}</div>
                {p.description && <div className="text-[10px] text-white/40 mt-1">{p.description}</div>}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-white/30">
                  <span>{p.tasks?.length || 0} tasks</span>
                  <span>{p.status || "active"}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {subView === "tasks" && statusOrder.map(status => {
          const group = grouped[status];
          if (!group?.length) return null;
          return (
            <div key={status} className="mb-4">
              <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusColor[status] || "#666" }} />
                {status} ({group.length})
              </div>
              {group.map(item => (
                <div key={item.id} className="rounded-lg px-4 py-3 mb-1.5 active:scale-[0.98] transition-transform"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 52 }}>
                  <div className="text-xs font-semibold text-white/80">{item.title}</div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {item.oracle && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: agentColor(item.oracle + "-oracle") + "15", color: agentColor(item.oracle + "-oracle") }}>
                        <ChibiPortrait name={item.oracle} size={14} />
                        {item.oracle}
                      </span>
                    )}
                    {item.priority && <span className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/[0.04]">{item.priority}</span>}
                    {(item as any).content?.number > 0 && <span className="text-[10px] text-white/20">#{(item as any).content.number}</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Inbox Panel ---
function InboxPanel({ send }: { send: (msg: object) => void }) {
  const asks = useFleetStore(s => s.asks);
  const dismissAsk = useFleetStore(s => s.dismissAsk);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const pending = asks.filter(a => !a.dismissed);

  // Also load recent feed for context
  useEffect(() => {
    fetch("/api/feed?limit=20").then(r => r.json()).then(d => setFeedItems(d.events || [])).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex items-center gap-2 flex-shrink-0" style={{ background: "#0e0e18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-sm font-bold text-cyan-400 tracking-wider">INBOX</span>
        {pending.length > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white bg-red-500">{pending.length}</span>}
        <span className="text-[10px] text-white/20 ml-auto">{asks.length} total</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ overscrollBehavior: "contain" }}>
        {pending.length === 0 && (
          <div className="text-center py-8">
            <div className="text-white/20 mb-4">No pending items</div>
            {/* Show recent feed activity instead */}
            <div className="text-left">
              <div className="text-xs text-white/30 mb-2 tracking-wider">RECENT ACTIVITY</div>
              {feedItems.slice(0, 10).map((e: any, i: number) => (
                <div key={i} className="text-[10px] text-white/25 py-1 border-b border-white/[0.03] flex items-center gap-2">
                  <ChibiPortrait name={e.oracle || "bob"} size={18} />
                  <span className="text-white/40 font-semibold">{e.oracle}</span>
                  <span className="truncate">{e.message?.slice(0, 60) || e.event}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {pending.map(ask => (
          <div key={ask.id} className="rounded-xl px-4 py-4 mb-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", minHeight: 60 }}>
            <div className="flex items-center gap-2 mb-2">
              <ChibiPortrait name={ask.oracle} size={28} />
              <span className="text-xs font-bold capitalize" style={{ color: agentColor(ask.oracle + "-oracle") }}>{ask.oracle}</span>
              <span className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/[0.04]">{ask.type}</span>
            </div>
            <div className="text-xs text-white/60 mb-3 leading-relaxed">{ask.message.slice(0, 300)}</div>
            <div className="flex gap-2">
              <button onClick={() => {
                send({ type: "send", target: "01-bob:0", text: `Approved: ${ask.message.slice(0, 100)}`, force: true });
                dismissAsk(ask.id);
              }} className="flex-1 rounded-xl font-bold active:scale-95 transition-transform"
                style={{ padding: "12px", minHeight: 48, background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)", fontSize: 13 }}>
                Approve
              </button>
              <button onClick={() => dismissAsk(ask.id)}
                className="flex-1 rounded-xl font-bold active:scale-95 transition-transform"
                style={{ padding: "12px", minHeight: 48, background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", fontSize: 13 }}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Loops Panel ---
function LoopsPanel() {
  const [loops, setLoops] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/loops").then(r => r.json()).then(d => setLoops(d.loops || [])).catch(() => {});
    const t = setInterval(() => fetch("/api/loops").then(r => r.json()).then(d => setLoops(d.loops || [])).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex-shrink-0" style={{ background: "#0e0e18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span className="text-sm font-bold text-cyan-400 tracking-wider">LOOPS</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ overscrollBehavior: "contain" }}>
        {loops.map(l => {
          const st = l.lastStatus === "ok" ? "#22c55e" : l.lastStatus === "error" ? "#ef4444" : l.lastStatus === "skipped" ? "#eab308" : "#666";
          return (
            <div key={l.id} className="flex items-center gap-3 rounded-lg px-3 py-3 mb-1" style={{ background: "rgba(255,255,255,0.02)", minHeight: 48 }}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: st, boxShadow: `0 0 6px ${st}40` }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white/80 truncate">{l.id}</div>
                <div className="text-[10px] text-white/30">{l.schedule} | {l.lastRun ? new Date(l.lastRun).toLocaleTimeString() : "never"}</div>
              </div>
              <button onClick={() => fetch("/api/loops/trigger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loopId: l.id }) })}
                className="px-3 py-2 rounded-lg text-[10px] text-cyan-400 active:scale-90" style={{ background: "rgba(34,211,238,0.08)", minHeight: 44 }}>
                Fire
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Tab definition ---
type TabId = "fleet" | "terminal" | "board" | "inbox" | "more";
type MoreView = "loops" | "fame" | "config" | null;

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "fleet", label: "Fleet", icon: "◉" },
  { id: "terminal", label: "Terminal", icon: "❯" },
  { id: "board", label: "Board", icon: "▦" },
  { id: "inbox", label: "Inbox", icon: "▣" },
  { id: "more", label: "More", icon: "⋯" },
];

// --- Main iPad Dashboard ---
export function IPadDashboard() {
  const { isLandscape: landscape } = useDevice();
  const [activeTab, setActiveTab] = useState<TabId>("fleet");
  const [moreView, setMoreView] = useState<MoreView>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);

  const { sessions, agents, handleMessage } = useSessions();
  const { connected, send } = useWebSocket(handleMessage);
  const askCount = useFleetStore(s => s.asks.filter(a => !a.dismissed).length);

  const onSelectAgent = useCallback((agent: AgentState) => {
    setSelectedAgent(agent);
    setActiveTab("terminal");
  }, []);

  const mainContent = useMemo(() => {
    if (moreView === "loops") return <LoopsPanel />;
    if (moreView === "fame") {
      // Lazy load
      return <iframe src="/#fame" className="w-full h-full border-0" />;
    }

    switch (activeTab) {
      case "fleet":
        return (
          <div className="h-full overflow-y-auto px-3 py-3" style={{ overscrollBehavior: "contain" }}>
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {agents.map(a => (
                <AgentCard key={a.target} agent={a} selected={selectedAgent?.target === a.target} onSelect={() => onSelectAgent(a)} />
              ))}
            </div>
          </div>
        );
      case "terminal":
        if (!selectedAgent) return <div className="flex items-center justify-center h-full text-white/20">Select an agent from Fleet</div>;
        return <TerminalPanel agent={selectedAgent} send={send} />;
      case "board":
        return <ProjectTaskPanel send={send} />;
      case "inbox":
        return <InboxPanel send={send} />;
      case "more":
        return (
          <div className="h-full px-4 py-4">
            <h2 className="text-sm font-bold text-white/50 mb-4 tracking-wider">MORE</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "loops" as MoreView, label: "Loops", desc: "Scheduled tasks", color: "#22d3ee" },
                { id: "fame" as MoreView, label: "Hall of Fame", desc: "Awards board", color: "#ffd700" },
              ].map(item => (
                <button key={item.id} onClick={() => { setMoreView(item.id); setActiveTab("more"); }}
                  className="rounded-xl p-4 text-left active:scale-95 transition-transform"
                  style={{ background: `${item.color}08`, border: `1px solid ${item.color}20`, minHeight: 80 }}>
                  <div className="text-sm font-bold" style={{ color: item.color }}>{item.label}</div>
                  <div className="text-[10px] text-white/30 mt-1">{item.desc}</div>
                </button>
              ))}
              <a href="/#office" className="rounded-xl p-4 text-left active:scale-95 transition-transform"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", minHeight: 80, display: "block", textDecoration: "none" }}>
                <div className="text-sm font-bold text-white/60">Desktop View</div>
                <div className="text-[10px] text-white/30 mt-1">Switch to full dashboard</div>
              </a>
            </div>
          </div>
        );
      default:
        return null;
    }
  }, [activeTab, moreView, agents, selectedAgent, send, onSelectAgent]);

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "#020208", touchAction: "none" }}>
      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ background: "#0a0a14", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span className="text-xs font-bold text-cyan-400 tracking-widest">BOB'S OFFICE</span>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: connected ? "#4caf50" : "#ef4444" }} />
        <span className="text-[10px] text-white/30">{agents.length} agents</span>
        {moreView && (
          <button onClick={() => setMoreView(null)} className="ml-2 text-[10px] text-cyan-400 active:scale-95"
            style={{ padding: "4px 10px", background: "rgba(34,211,238,0.1)", borderRadius: 8 }}>
            ← Back
          </button>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Fleet sidebar (landscape only, when not viewing fleet tab) */}
        {landscape && activeTab !== "fleet" && (
          <div className="flex-shrink-0" style={{ width: 260 }}>
            <FleetSidebar agents={agents} selectedAgent={selectedAgent} onSelectAgent={onSelectAgent} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 min-h-0">
          {mainContent}
        </div>
      </div>

      {/* Bottom Tab Bar — 60px, touch-friendly */}
      <div className="flex items-center flex-shrink-0" style={{
        height: 60,
        background: "#0a0a14",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id && !moreView;
          return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setMoreView(null); }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform relative"
              style={{ minHeight: 52, color: active ? "#22d3ee" : "rgba(255,255,255,0.3)" }}>
              <span className="text-lg">{tab.icon}</span>
              <span className="text-[9px] font-bold tracking-wider">{tab.label}</span>
              {tab.id === "inbox" && askCount > 0 && (
                <span className="absolute top-1 right-1/4 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white bg-red-500 animate-pulse">
                  {askCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

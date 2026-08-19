import { memo, useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useFleetStore } from "../lib/store";
import { agentColor } from "../lib/constants";
import type { AskItem } from "../lib/types";
import type { CrossTeamQueueItem } from "../lib/cross-team-queue-types";
import { TEAM_LABELS, TEAM_TAB_ORDER, type Team } from "../lib/teams";
import {
  fetchCrossTeamQueue,
  hoursSinceISO,
  itemAgeHours,
  ageLabel,
  ageBand,
  AGE_BAND_STYLE,
  PRIORITY_STYLE,
  loadReadState,
  markRead,
  isUnread,
} from "../lib/crossTeamQueue";

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const TYPE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  input: { bg: "rgba(34,211,238,0.12)", text: "#22d3ee", label: "Input" },
  attention: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24", label: "Attention" },
  plan: { bg: "rgba(168,85,247,0.12)", text: "#a855f7", label: "Approval" },
};

function AskCard({ ask, send, onClose }: { ask: AskItem; send: (msg: object) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dismissAsk = useFleetStore((s) => s.dismissAsk);
  const accent = agentColor(ask.oracle);
  const style = TYPE_STYLE[ask.type] || TYPE_STYLE.input;

  const sendReply = useCallback((reply: string) => {
    if (!ask.target) return;
    send({ type: "send", target: ask.target, text: reply });
    setTimeout(() => send({ type: "send", target: ask.target, text: "\r" }), 50);
    setSent(true);
    setTimeout(() => dismissAsk(ask.id), 600);
  }, [ask, send, dismissAsk]);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    sendReply(text.trim());
    setText("");
  }, [text, sendReply]);

  if (sent) {
    return (
      <div className="rounded-xl p-4 border transition-all duration-300 opacity-50"
        style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.2)" }}>
        <span className="text-sm text-emerald-400 font-mono">Sent</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 border transition-all"
      style={{ background: "rgba(255,255,255,0.03)", borderColor: `${accent}25` }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: `${accent}20`, color: accent }}>
          {ask.oracle.charAt(0).toUpperCase()}
        </div>
        <span className="text-[13px] font-semibold truncate" style={{ color: accent }}>
          {ask.oracle}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: style.bg, color: style.text }}>
          {style.label}
        </span>
        <span className="text-[10px] font-mono text-white/25 ml-auto flex-shrink-0">{timeAgo(ask.ts)}</span>
      </div>

      {/* Message */}
      <p className="text-[13px] text-white/80 mb-3 leading-relaxed whitespace-pre-wrap line-clamp-3">
        {ask.message}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {(ask.type === "plan" || ask.type === "attention") && (
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all"
            style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
            onClick={() => sendReply("y")}>
            Approve
          </button>
        )}
        {ask.type === "plan" && (
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
            onClick={() => sendReply("n")}>
            Reject
          </button>
        )}
        <input ref={inputRef} type="text" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          placeholder="Reply..."
          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs text-white outline-none placeholder:text-white/20 [&::-webkit-search-cancel-button]:hidden [&::-webkit-clear-button]:hidden [&::-ms-clear]:hidden"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", WebkitAppearance: "none" as const }}
          enterKeyHint="send" autoComplete="off" autoCorrect="off"
        />
        {text.trim() && (
          <button className="px-2.5 py-1.5 rounded-lg text-xs active:scale-95 transition-all"
            style={{ background: `${accent}30`, color: accent }}
            onClick={handleSend}>
            Send
          </button>
        )}
        <button className="px-2 py-1.5 rounded-lg text-[10px] font-mono active:scale-95 transition-all"
          style={{ color: "rgba(255,255,255,0.3)" }}
          onClick={() => dismissAsk(ask.id)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── Cross-Team Queue ───────────────────────────────────────────────
// PR2 Day 1 scaffold — feature/cross-team-queue
// Wires to /api/cross-team-queue (FORGE lane, ADR-002). Uses fixture in dev via ?fixture=queue.

type TeamTab = "all" | Team;

function QueueItemRow({
  item,
  unread,
  onOpen,
}: {
  item: CrossTeamQueueItem;
  unread: boolean;
  onOpen: (item: CrossTeamQueueItem) => void;
}) {
  const hours = itemAgeHours(item);
  const band = ageBand(hours);
  const ageStyle = AGE_BAND_STYLE[band];
  const priStyle = PRIORITY_STYLE[item.priority];
  const senderColor = agentColor(item.from);

  return (
    <article
      className="rounded-xl p-3 border transition-all hover:bg-white/[0.02]"
      style={{
        background: unread ? "rgba(34,211,238,0.04)" : "rgba(255,255,255,0.02)",
        borderColor: unread ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.06)",
      }}
      aria-label={`${item.from} to ${item.to}, ${item.type}, ${ageStyle.srLabel}, priority ${priStyle.label}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: ageStyle.color }}
          role="img"
          aria-label={ageStyle.srLabel}
          title={ageStyle.srLabel}
        />
        <span className="text-[11px] font-semibold truncate" style={{ color: senderColor }}>
          {item.from}
        </span>
        <span className="text-[10px] text-white/30">→</span>
        <span className="text-[11px] font-semibold truncate text-white/70">{item.to}</span>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: `${priStyle.color}18`, color: priStyle.color }}
          aria-label={`Priority ${priStyle.label}`}
        >
          {item.type}
        </span>
        <span className="text-[10px] font-mono text-white/30 ml-auto flex-shrink-0">{ageLabel(hours)}</span>
        <button
          onClick={() => onOpen(item)}
          className="text-white/40 hover:text-white/80 text-xs px-1.5 py-0.5 rounded transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400"
          aria-label={`Open ${item.title} in editor`}
          title="Open in editor"
        >
          ↗
        </button>
      </div>
      <h3 className="text-[13px] text-white/85 font-medium leading-snug mb-1 line-clamp-2">{item.title}</h3>
      {item.preview && (
        <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2 mb-1">{item.preview}</p>
      )}
      {item.actionHint && (
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          <span className="text-white/30 font-mono">Action:</span> {item.actionHint}
        </p>
      )}
    </article>
  );
}

function TabBar({
  active,
  counts,
  onChange,
}: {
  active: TeamTab;
  counts: Record<TeamTab, number>;
  onChange: (tab: TeamTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Filter cross-team decisions by team" className="flex items-center gap-1 mb-3">
      {TEAM_TAB_ORDER.map((tab) => {
        const label = tab === "all" ? "All" : TEAM_LABELS[tab as Team];
        const count = counts[tab] ?? 0;
        const selected = active === tab;
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={selected}
            aria-controls="cross-team-queue-panel"
            onClick={() => onChange(tab)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all focus-visible:outline-2 focus-visible:outline-cyan-400"
            style={{
              background: selected ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.04)",
              color: selected ? "#22d3ee" : "rgba(255,255,255,0.5)",
              border: `1px solid ${selected ? "rgba(34,211,238,0.3)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            {label}
            <span className="ml-1.5 text-white/40">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function CrossTeamSection() {
  const queue = useFleetStore((s) => s.queue);
  const scannedAt = useFleetStore((s) => s.queueScannedAt);
  const parseErrors = useFleetStore((s) => s.queueParseErrors);
  const setQueue = useFleetStore((s) => s.setQueue);
  const setQueueError = useFleetStore((s) => s.setQueueError);
  const [tab, setTab] = useState<TeamTab>("all");
  const [readState, setReadState] = useState<Record<string, number>>(() => loadReadState());

  // Poll every 30s — matches /api/costs cadence (design §6)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchCrossTeamQueue();
      if (cancelled) return;
      if (res) setQueue(res);
      else setQueueError("Failed to load cross-team queue");
    };
    load();
    const iv = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [setQueue, setQueueError]);

  const filtered = useMemo(() => {
    if (tab === "all") return queue;
    return queue.filter((item) => item.team === tab);
  }, [queue, tab]);

  const counts: Record<TeamTab, number> = useMemo(() => {
    const c: Record<TeamTab, number> = { all: queue.length, software: 0, business: 0, cross: 0, unknown: 0 };
    for (const item of queue) c[item.team] += 1;
    return c;
  }, [queue]);

  const onOpen = useCallback((item: CrossTeamQueueItem) => {
    markRead([item.id]);
    setReadState(loadReadState());
    // file:// deep-link; many browsers block from http origins — surface via copy fallback
    const url = `file://${item.path}`;
    try {
      window.open(url, "_blank");
    } catch {
      navigator.clipboard?.writeText(item.path).catch(() => {});
    }
  }, []);

  const scannedAgo = scannedAt ? ageLabel(hoursSinceISO(scannedAt)) : "—";

  return (
    <section aria-labelledby="cross-team-heading" className="mt-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 id="cross-team-heading" className="text-[11px] font-mono text-white/40 uppercase tracking-wider">
          Cross-Team Decisions <span className="text-white/30">({filtered.length})</span>
        </h3>
        <span className="text-[9px] font-mono text-white/20">scanned {scannedAgo}</span>
      </div>

      <TabBar active={tab} counts={counts} onChange={setTab} />

      <div
        id="cross-team-queue-panel"
        role="tabpanel"
        aria-live="polite"
        className="flex flex-col gap-2"
      >
        {filtered.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-white/30 text-[12px]">No items in {tab === "all" ? "queue" : TEAM_LABELS[tab as Team]}</p>
          </div>
        ) : (
          filtered.map((item) => (
            <QueueItemRow
              key={item.id}
              item={item}
              unread={isUnread(item.id, item.mtime, readState)}
              onOpen={onOpen}
            />
          ))
        )}
      </div>

      {parseErrors.length > 0 && (
        <details className="mt-3 text-[10px] font-mono text-red-400/60">
          <summary className="cursor-pointer">
            {parseErrors.length} parse error{parseErrors.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 ml-3 space-y-0.5">
            {parseErrors.map((e) => (
              <li key={e.path} className="truncate">
                {e.path.split("/").slice(-2).join("/")}: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export const InboxOverlay = memo(function InboxOverlay({ send, onClose }: { send: (msg: object) => void; onClose: () => void }) {
  const asks = useFleetStore((s) => s.asks);
  const pending = asks.filter((a) => !a.dismissed);
  const dismissed = asks.filter((a) => a.dismissed).slice(0, 5);
  const queue = useFleetStore((s) => s.queue);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-4 max-h-[80vh] flex flex-col rounded-2xl border overflow-hidden"
        style={{ background: "#0a0a12", borderColor: "rgba(255,255,255,0.08)", boxShadow: "0 25px 50px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <h2 className="text-sm font-bold tracking-wider text-cyan-400 uppercase">
            Inbox {pending.length > 0 && <span className="text-red-400">({pending.length})</span>}
            {queue.length > 0 && <span className="text-white/40 text-[11px] font-normal ml-2">+ {queue.length} cross-team</span>}
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg leading-none px-1" aria-label="Close inbox">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <section aria-labelledby="live-asks-heading">
            <h3 id="live-asks-heading" className="text-[11px] font-mono text-white/40 uppercase tracking-wider mb-2">
              Live Asks <span className="text-white/30">({pending.length})</span>
            </h3>
            {pending.length === 0 && (
              <div className="text-center py-6">
                <p className="text-white/30 text-[12px]">No pending asks</p>
                <p className="text-white/15 text-[10px] mt-1">Agents will appear here when they need input</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {pending.map((ask) => (
                <AskCard key={ask.id} ask={ask} send={send} onClose={onClose} />
              ))}
            </div>

            {dismissed.length > 0 && (
              <>
                <div className="text-[10px] font-mono text-white/15 uppercase tracking-wider mt-5 mb-2">Recent</div>
                <div className="flex flex-col gap-1">
                  {dismissed.map((ask) => (
                    <div key={ask.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg opacity-40"
                      style={{ background: "rgba(255,255,255,0.02)" }}>
                      <span className="text-xs font-semibold" style={{ color: agentColor(ask.oracle) }}>
                        {ask.oracle}
                      </span>
                      <span className="text-[10px] text-white/40 truncate flex-1">{ask.message}</span>
                      <span className="text-[9px] font-mono text-white/20 flex-shrink-0">{timeAgo(ask.ts)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <CrossTeamSection />
        </div>
      </div>
    </div>
  );
});

import { AppShell, type AppContext } from "../core/AppShell";
import { useFleetStore } from "../lib/store";
import { agentColor } from "../lib/constants";
import { useState, useRef, useCallback } from "react";
import type { AskItem } from "../lib/types";

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

function AskCard({ ask, send }: { ask: AskItem; send: (msg: object) => void }) {
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

  if (sent) {
    return (
      <div className="rounded-xl p-4 border opacity-50" style={{ background: "rgba(34,197,94,0.06)", borderColor: "rgba(34,197,94,0.2)" }}>
        <span className="text-sm text-emerald-400 font-mono">Sent</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 border" style={{ background: "rgba(255,255,255,0.03)", borderColor: `${accent}25` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${accent}20`, color: accent }}>
          {ask.oracle.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-semibold" style={{ color: accent }}>{ask.oracle}</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: style.bg, color: style.text }}>{style.label}</span>
        <span className="text-[10px] font-mono text-white/25 ml-auto">{timeAgo(ask.ts)}</span>
      </div>
      <p className="text-sm text-white/80 mb-3 leading-relaxed whitespace-pre-wrap">{ask.message}</p>
      <div className="flex items-center gap-1.5">
        {(ask.type === "plan" || ask.type === "attention") && (
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }} onClick={() => sendReply("y")}>Approve</button>
        )}
        {ask.type === "plan" && (
          <button className="px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }} onClick={() => sendReply("n")}>Reject</button>
        )}
        <input ref={inputRef} type="text" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { sendReply(text.trim()); setText(""); } }}
          placeholder="Reply..."
          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg text-xs text-white outline-none placeholder:text-white/20 [&::-webkit-search-cancel-button]:hidden [&::-webkit-clear-button]:hidden [&::-ms-clear]:hidden"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)", WebkitAppearance: "none" as const }}
          enterKeyHint="send" autoComplete="off"
        />
        <button className="px-2 py-1.5 rounded-lg text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }} onClick={() => dismissAsk(ask.id)}>Dismiss</button>
      </div>
    </div>
  );
}

function InboxContent({ send }: { send: (msg: object) => void }) {
  const asks = useFleetStore((s) => s.asks);
  const pending = asks.filter((a) => !a.dismissed);
  const dismissed = asks.filter((a) => a.dismissed).slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-lg font-bold tracking-wider text-cyan-400 uppercase mb-6">
        Inbox {pending.length > 0 && <span className="text-red-400">({pending.length})</span>}
      </h1>

      {pending.length === 0 && (
        <div className="text-center py-16">
          <p className="text-white/30 text-sm">No pending asks</p>
          <p className="text-white/15 text-[11px] mt-1">Agents will appear here when they need input</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {pending.map((ask) => <AskCard key={ask.id} ask={ask} send={send} />)}
      </div>

      {dismissed.length > 0 && (
        <>
          <div className="text-[10px] font-mono text-white/15 uppercase tracking-wider mt-8 mb-2">Recent</div>
          <div className="flex flex-col gap-1">
            {dismissed.map((ask) => (
              <div key={ask.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg opacity-40" style={{ background: "rgba(255,255,255,0.02)" }}>
                <span className="text-xs font-semibold" style={{ color: agentColor(ask.oracle) }}>{ask.oracle}</span>
                <span className="text-[10px] text-white/40 truncate flex-1">{ask.message}</span>
                <span className="text-[9px] font-mono text-white/20">{timeAgo(ask.ts)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default () => (
  <AppShell view="inbox">
    {(ctx) => <InboxContent send={ctx.send} />}
  </AppShell>
);

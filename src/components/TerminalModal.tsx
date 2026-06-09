import { lazy, Suspense, useRef, useState, useCallback } from "react";
import type { AgentState } from "../lib/types";
import type { XTerminalHandle } from "./XTerminal";

const XTerminal = lazy(() => import("./XTerminal").then(m => ({ default: m.XTerminal })));

interface TerminalModalProps {
  agent: AgentState;
  send: (msg: object) => void;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  onSelectSibling: (agent: AgentState) => void;
  siblings: AgentState[];
}

function cleanName(name: string) {
  return name.replace(/-oracle$/, "").replace(/-/g, " ");
}

const STATUS_DOT: Record<string, string> = {
  busy: "#fdd835",
  ready: "#4caf50",
  idle: "#666",
};

export function TerminalModal({ agent, send, onClose, onNavigate, onSelectSibling, siblings }: TerminalModalProps) {
  const xtermRef = useRef<XTerminalHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "warn" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: "ok" | "warn" | "err" = "ok") => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // 📎 attach: upload an image to labubu-upload, then inject its saved path into
  // the running Oracle PTY (same path-injection contract as TerminalView, but
  // delivered through xterm's PTY socket instead of the capture-stream queue).
  // The modal only opens for a tracked agent (claude pane), so the target is
  // always a valid Oracle — no isClaudeWindow guard needed.
  const uploadAttachment = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/upload/api/file", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.saved?.length) {
        const reason = data?.errors?.[0]?.reason || `HTTP ${res.status}`;
        showToast(`อัปโหลดล้มเหลว: ${reason}`, "err");
        return;
      }
      const path: string = data.saved[0].path;
      // `\r` submits — xterm sends CR on Enter, so this types the line and runs it.
      xtermRef.current?.inject(`[ภาพแนบ — โปรดดู: ${path}]\r`);
      showToast(`ส่งภาพไปที่ ${agent.name} แล้ว`, "ok");
    } catch {
      showToast("อัปโหลดล้มเหลว (network)", "err");
    } finally {
      setUploading(false);
    }
  }, [agent.name, showToast]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 bg-[#0e0e18] border-b border-white/[0.06]">
          <div className="flex gap-1.5 shrink-0">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-110 cursor-pointer" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>

          {/* Agent tab bar */}
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none mx-2">
            {siblings.map((s, i) => {
              const active = s.target === agent.target;
              return (
                <button
                  key={s.target}
                  onClick={() => onSelectSibling(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono whitespace-nowrap cursor-pointer transition-all ${
                    active
                      ? "bg-white/10 text-white/90"
                      : "text-white/35 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: STATUS_DOT[s.status] || "#555" }}
                  />
                  {i < 9 && (
                    <span className="text-[9px] text-white/20">{i + 1}</span>
                  )}
                  {cleanName(s.name)}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {/* 📎 attach — upload an image and inject its saved path into this Oracle */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAttachment(f);
                e.target.value = "";  // allow re-selecting the same file
              }}
            />
            <button
              onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              disabled={uploading}
              className="px-2 py-0.5 rounded text-[12px] font-mono text-white/40 hover:text-white/80 hover:bg-white/[0.06] border border-transparent hover:border-white/10 transition-all cursor-pointer disabled:cursor-not-allowed"
              title={`แนบภาพไปยัง ${agent.name}`}
            >
              {uploading ? "⏳" : "📎"}
            </button>
            <button
              onClick={() => { if (confirm(`Restart ${agent.name}?`)) send({ type: "restart", target: agent.target }); }}
              className="px-2 py-0.5 rounded text-[10px] font-mono text-white/30 hover:text-orange-400 hover:bg-orange-400/10 border border-transparent hover:border-orange-400/20 transition-all cursor-pointer"
              title="Restart agent (Ctrl+C → relaunch)"
            >
              restart
            </button>
            {siblings.length > 1 && (
              <span className="text-[9px] text-white/20 tracking-wider">Alt+1-{Math.min(9, siblings.length)}</span>
            )}
            <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl font-bold text-white/30 hover:text-white/70 hover:bg-red-500/15 active:scale-90 cursor-pointer transition-all" title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* Terminal — xterm.js via PTY WebSocket */}
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full text-white/30 text-sm font-mono">
              Loading terminal...
            </div>
          }>
            <XTerminal
              ref={xtermRef}
              target={agent.target}
              onClose={onClose}
              onNavigate={onNavigate}
              siblings={siblings}
              onSelectSibling={onSelectSibling}
            />
          </Suspense>
        </div>
      </div>

      {/* Attach toast — "sent to <agent>" / error */}
      {toast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-14 z-10 px-3 py-1.5 rounded-lg text-[12px] font-mono shadow-lg pointer-events-none"
          style={{
            background: toast.kind === "ok" ? "#1b3a2a" : toast.kind === "warn" ? "#3a341b" : "#3a1b1b",
            color: toast.kind === "ok" ? "#7ee2a8" : toast.kind === "warn" ? "#e2cf7e" : "#e27e7e",
            border: `1px solid ${toast.kind === "ok" ? "#2e6b4a" : toast.kind === "warn" ? "#6b5e2e" : "#6b2e2e"}`,
          }}
        >
          {toast.kind === "ok" ? "✓ " : toast.kind === "warn" ? "⚠ " : "✕ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

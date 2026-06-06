import { memo, useState, useEffect, useRef, useCallback } from "react";
import { ansiToHtml } from "../lib/ansi";
import { roomStyle } from "../lib/constants";
import { useWebSocket } from "../hooks/useWebSocket";
import { TerminalKeyBar } from "./TerminalKeyBar";
import type { Session, AgentState } from "../lib/types";

interface TerminalViewProps {
  sessions: Session[];
  agents: AgentState[];
  connected: boolean;
  onSelectAgent: (agent: AgentState) => void;
}

export const TerminalView = memo(function TerminalView({ sessions, agents, connected, onSelectAgent }: TerminalViewProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [captureHtml, setCaptureHtml] = useState("");
  const [inputBuf, setInputBuf] = useState("");
  const [sendQueue, setSendQueue] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const selectedTargetRef = useRef<string | null>(null);
  selectedTargetRef.current = selectedTarget;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputElRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "warn" | "err" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: "ok" | "warn" | "err" = "ok") => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Shared WebSocket with reconnection for capture stream
  const handleCapture = useCallback((data: any) => {
    if (data.type === "capture") {
      const out = outputRef.current;
      const atBottom = out ? out.scrollHeight - out.scrollTop - out.clientHeight < 60 : true;
      setCaptureHtml(ansiToHtml(data.content || "(empty)"));
      if (atBottom) requestAnimationFrame(() => out?.scrollTo(0, out.scrollHeight));
    }
  }, []);

  const handleConnect = useCallback((sendFn: (msg: object) => void) => {
    const target = selectedTargetRef.current;
    if (target) {
      sendFn({ type: "subscribe", target });
      sendFn({ type: "select", target });
    }
  }, []);

  const { send: wsSend } = useWebSocket(handleCapture, {
    types: ["capture"],
    onConnect: handleConnect,
  });

  // Subscribe when target changes
  useEffect(() => {
    if (selectedTarget) {
      wsSend({ type: "subscribe", target: selectedTarget });
      wsSend({ type: "select", target: selectedTarget });
    }
  }, [selectedTarget, wsSend]);

  const selectWindow = useCallback((target: string) => {
    setSelectedTarget(target);
    setCaptureHtml("");
    setInputBuf("");
    setSendQueue([]);
    // Focus the real text field so a hardware OR mobile soft keyboard can type.
    inputElRef.current?.focus();
  }, []);

  // Window navigation shared by Alt+Arrow (desktop) and used by the input handler.
  const gotoAdjacent = useCallback((dir: -1 | 1) => {
    if (!selectedTargetRef.current) return;
    const allWindows = sessions.flatMap(s => s.windows.map(w => ({ target: `${s.name}:${w.index}`, name: w.name })));
    const idx = allWindows.findIndex(w => w.target === selectedTargetRef.current);
    if (idx < 0) return;
    const next = allWindows[(idx + dir + allWindows.length) % allWindows.length];
    selectWindow(next.target);
  }, [sessions, selectWindow]);

  // Flush send queue
  useEffect(() => {
    if (sendingRef.current || sendQueue.length === 0) return;
    if (!selectedTarget) return;

    sendingRef.current = true;
    const text = sendQueue[0];
    wsSend({ type: "send", target: selectedTarget, text, force: true });
    setTimeout(() => {
      setSendQueue(q => q.slice(1));
      sendingRef.current = false;
    }, 100);
  }, [sendQueue, selectedTarget, wsSend]);

  const queueSend = useCallback((text: string) => {
    if (!text || !selectedTarget) return;
    setSendQueue(q => [...q, text]);
  }, [selectedTarget]);

  // Display name for the selected target (also used by the attach handler).
  const selectedName = selectedTarget
    ? sessions.flatMap(s => s.windows.map(w => ({ target: `${s.name}:${w.index}`, name: w.name }))).find(w => w.target === selectedTarget)?.name || ""
    : "";

  // 📎 attach: upload an image to labubu-upload, then inject its saved path into
  // the SELECTED Oracle session via the same queueSend path used for typing.
  // maw only tracks claude panes as AgentState — no agent for a target ⇒ it's a
  // bash/non-claude window, so we warn instead of injecting (path would run as a
  // shell command and the image would never reach an Oracle's context).
  const uploadAttachment = useCallback(async (file: File) => {
    if (!selectedTarget) { showToast("เลือกหน้าต่างก่อนแนบภาพ", "warn"); return; }
    const isClaudeWindow = agents.some(a => a.target === selectedTarget);
    if (!isClaudeWindow) {
      showToast(`"${selectedName || selectedTarget}" ไม่ใช่ Claude session — ไม่ได้ฉีดภาพ (เลือกหน้าต่าง Oracle)`, "warn");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/upload/api/file", { method: "POST", credentials: "same-origin", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.saved?.length) {
        const reason = data?.errors?.[0]?.reason || `HTTP ${res.status}`;
        showToast(`อัปโหลดล้มเหลว: ${reason}`, "err");
        return;
      }
      const path: string = data.saved[0].path;
      queueSend(`[ภาพแนบ — โปรดดู: ${path}]\n`);
      showToast(`ส่งภาพไปที่ ${selectedName || selectedTarget} แล้ว`, "ok");
    } catch {
      showToast("อัปโหลดล้มเหลว (network)", "err");
    } finally {
      setUploading(false);
    }
  }, [selectedTarget, selectedName, agents, queueSend, showToast]);

  // Accept-suggestion = exactly what desktop Tab does: forward the typed buffer
  // PLUS a literal Tab to the PTY, so the claude TUI running in the captured pane
  // tab-completes / accepts its own ghost suggestion. Desktop Tab is ACCEPT-ONLY
  // (no trailing \r) — it does NOT auto-submit; the user presses Enter after. The
  // desktop Tab keydown below uses this handler and keeps that accept-only shape.
  const acceptSuggestion = useCallback(() => {
    if (!selectedTarget) return;
    queueSend(inputBuf + "\t");
    setInputBuf("");
  }, [selectedTarget, inputBuf, queueSend]);

  // Mobile ⇥ button = accept + submit in ONE tap (DIVERGES from desktop Tab by
  // design — Boss 2026-06-04: "suggestion ขึ้นมาแล้วส่งให้ oracle ได้เลย"). It
  // forwards the typed buffer + a literal Tab + a carriage return (\t\r), so the
  // claude TUI accepts its ghost suggestion AND submits the line, since phones
  // have no convenient way to then press Enter. Desktop Tab stays accept-only.
  const acceptSuggestionAndSubmit = useCallback(() => {
    if (!selectedTarget) return;
    queueSend(inputBuf + "\t\r");
    setInputBuf("");
  }, [selectedTarget, inputBuf, queueSend]);

  // Keyboard handler for the REAL textarea. Native typing/paste/IME (Thai!) is
  // handled by the browser via onChange — we only intercept the control keys.
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Alt+Arrow to navigate between windows
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      gotoAdjacent(e.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    // IME composition in progress (Thai/CJK) — let the keystroke commit text,
    // never treat Enter as "send" mid-composition.
    if (e.nativeEvent.isComposing) return;

    if (!selectedTarget) return;

    if (e.key === "Enter" && !e.shiftKey) {
      // Enter → send; Shift+Enter falls through to native newline insertion.
      e.preventDefault();
      if (inputBuf) { queueSend(inputBuf); setInputBuf(""); }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputBuf(""); setSendQueue([]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      acceptSuggestion();
    }
    // Backspace, Ctrl/Cmd+V paste, char entry, etc. — handled natively.
  }, [selectedTarget, inputBuf, queueSend, gotoAdjacent, acceptSuggestion]);

  return (
    <div className="flex flex-col sm:flex-row mx-4 sm:mx-6 mb-3 rounded-2xl overflow-hidden border border-white/[0.06]" style={{ height: "calc(100vh - 72px)" }}>
      {/* Mobile oracle picker — a native dropdown replaces the long stacked fleet
          list on phones, freeing vertical room for the terminal + input. The
          OS-native <select> popover is the right mobile affordance. Desktop keeps
          the full sidebar (hidden sm:flex below). */}
      <div className="sm:hidden flex-shrink-0 border-b border-white/[0.06] px-3 py-2" style={{ background: "#08080e" }}>
        <select
          className="w-full bg-transparent text-[13px] font-mono text-white/90 outline-none border border-white/[0.1] rounded-lg px-2 py-1.5"
          value={selectedTarget ?? ""}
          onChange={(e) => { if (e.target.value) selectWindow(e.target.value); }}
          style={{ background: "#0d0d14" }}
        >
          <option value="" disabled>เลือก Oracle…</option>
          {sessions.map(session => (
            <optgroup key={session.name} label={session.name}>
              {session.windows.map(w => {
                const target = `${session.name}:${w.index}`;
                const agent = agents.find(a => a.target === target);
                const dot = agent?.status === "busy" ? "🟠" : agent?.status === "ready" ? "🟢" : "⚫";
                return (
                  <option key={target} value={target}>
                    {dot} {w.index} {w.name}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Sidebar — fixed 220px column on sm+; hidden on mobile (dropdown above replaces it) */}
      <div className="hidden sm:flex sm:w-[220px] flex-shrink-0 flex-col sm:max-h-none sm:border-r border-white/[0.06] overflow-y-auto" style={{ background: "#08080e" }}>
        {sessions.map(session => {
          const style = roomStyle(session.name);
          return (
            <div key={session.name} className="py-1">
              <div className="px-4 py-1 text-[10px] uppercase tracking-[1px]" style={{ color: style.accent + "80" }}>
                {session.name}
              </div>
              {session.windows.map(w => {
                const target = `${session.name}:${w.index}`;
                const isSelected = target === selectedTarget;
                const agent = agents.find(a => a.target === target);
                const statusColor = agent?.status === "busy" ? "#ffa726" : agent?.status === "ready" ? "#4caf50" : "#333";
                return (
                  <div
                    key={target}
                    className="flex items-center gap-2 py-1.5 cursor-pointer transition-colors"
                    style={{
                      paddingLeft: 12, paddingRight: 12,
                      background: isSelected ? `${style.accent}12` : "transparent",
                      borderLeft: isSelected ? `3px solid ${style.accent}` : "3px solid transparent",
                    }}
                    onClick={() => selectWindow(target)}
                  >
                    <span className="text-[11px] font-mono text-white/30 w-4 text-right flex-shrink-0">{w.index}</span>
                    <span className="text-[12px] font-mono truncate" style={{ color: isSelected ? style.accent : "#999" }}>
                      {w.name}
                    </span>
                    <span
                      className="w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0"
                      style={{ background: statusColor, boxShadow: w.active ? `0 0 4px ${statusColor}` : undefined }}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Terminal pane */}
      <div
        ref={termRef}
        className="flex-1 flex flex-col min-w-0 min-h-0 outline-none relative"
        onClick={() => inputElRef.current?.focus()}
      >
        {/* Attach toast — "sent to <target>" / warn / error */}
        {toast && (
          <div
            className="absolute left-1/2 -translate-x-1/2 top-3 z-10 px-3 py-1.5 rounded-lg text-[12px] font-mono shadow-lg pointer-events-none"
            style={{
              background: toast.kind === "ok" ? "#1b3a2a" : toast.kind === "warn" ? "#3a341b" : "#3a1b1b",
              color: toast.kind === "ok" ? "#7ee2a8" : toast.kind === "warn" ? "#e2cf7e" : "#e27e7e",
              border: `1px solid ${toast.kind === "ok" ? "#2e6b4a" : toast.kind === "warn" ? "#6b5e2e" : "#6b2e2e"}`,
            }}
          >
            {toast.kind === "ok" ? "✓ " : toast.kind === "warn" ? "⚠ " : "✕ "}{toast.msg}
          </div>
        )}
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.06] flex-shrink-0" style={{ background: "#0a0a12" }}>
          <span className="text-xs font-mono text-white/40">{selectedName || "select a window"}</span>
          {selectedTarget && <span className="text-[10px] font-mono text-white/20">{selectedTarget}</span>}
          <span className="ml-auto text-[10px] font-mono" style={{ color: connected ? "#4caf50" : "#ef5350" }}>
            {connected ? "live" : "reconnecting"}
          </span>
        </div>

        {/* Output */}
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[13px] leading-[1.35]"
          style={{ background: "#0a0a0f", whiteSpace: "pre", wordBreak: "normal", overflowX: "auto", color: "#aaa" }}
        >
          {captureHtml ? (
            <div dangerouslySetInnerHTML={{ __html: captureHtml }} />
          ) : (
            <div className="text-white/15 text-center mt-[30vh] text-sm">
              {selectedTarget ? "connecting..." : "select a window \u2190"}
            </div>
          )}
        </div>

        {/* Mobile control-key bar — same raw-key PTY path as the composer, for
            driving interactive claude TUIs the soft keyboard can't reach. Keys
            send immediately (no queue) so arrow navigation feels responsive. */}
        <TerminalKeyBar
          onKey={(seq) => { if (selectedTarget) wsSend({ type: "send", target: selectedTarget, text: seq, force: true }); }}
        />

        {/* Input line */}
        <div
          className="flex items-start px-3 py-1.5 border-t border-white/[0.06] font-mono text-[13px] min-h-[32px]"
          style={{ background: "#0d0d14" }}
        >
          {/* 📎 attach — target-aware: disabled until a window is selected */}
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
          <span
            className="mr-2 mt-[1px] flex-shrink-0 select-none"
            title={selectedTarget ? "แนบภาพไปยังหน้าต่างที่เลือก" : "เลือกหน้าต่างก่อน"}
            style={{
              cursor: selectedTarget && !uploading ? "pointer" : "not-allowed",
              opacity: selectedTarget && !uploading ? 0.85 : 0.25,
            }}
            onMouseDown={(e) => e.preventDefault()}  // keep terminal focus
            onClick={() => { if (selectedTarget && !uploading) fileInputRef.current?.click(); }}
          >
            {uploading ? "⏳" : "📎"}
          </span>
          <span className="text-white/30 mr-2 mt-[1px] flex-shrink-0">&gt;</span>
          {/* Real focusable field — a hidden tabIndex div never raises the mobile
              soft keyboard, so typing was impossible on phones. A textarea does,
              and gets native Thai IME + paste for free. */}
          <textarea
            ref={inputElRef}
            value={inputBuf}
            rows={1}
            disabled={!selectedTarget}
            onChange={(e) => setInputBuf(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={selectedTarget ? "พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)" : "เลือกหน้าต่างก่อน"}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="send"
            className="flex-1 min-w-0 bg-transparent outline-none border-0 resize-none text-white/90 font-mono text-[13px] leading-[1.35] placeholder:text-white/20 disabled:cursor-not-allowed"
            style={{ caretColor: "#89b4fa", padding: 0, margin: 0 }}
          />
          {/* Mobile ⇥ accept-suggestion — phones have no Tab key, so this button
              is the only way to accept the claude TUI's ghost suggestion on a
              phone. Unlike desktop Tab (accept-only), this button accepts AND
              submits in one tap (sends typed text + literal Tab + \r → TUI
              completes then submits) — Boss 2026-06-04 intent. sm:hidden =
              mobile-only, like the oracle dropdown above. Enabled whenever a
              window is selected; the ghost lives in the TUI, not React, so we
              can't gate on "a suggestion currently exists". */}
          <button
            type="button"
            className="sm:hidden flex-shrink-0 ml-2 px-2 py-0.5 rounded text-[12px] font-mono text-purple-300/90 border border-purple-300/25 hover:bg-purple-300/10 active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
            title="รับคำแนะนำแล้วส่งเลย (เหมือนกด Tab แล้ว Enter)"
            disabled={!selectedTarget}
            onMouseDown={(e) => e.preventDefault()}  // keep textarea focus
            onClick={acceptSuggestionAndSubmit}
          >
            ⇥ รับ
          </button>
          {sendQueue.length > 0 && (
            <span className="text-white/30 text-[11px] ml-2">({sendQueue.length} queued)</span>
          )}
          {(inputBuf || sendQueue.length > 0) && (
            <span
              className="ml-auto text-white/30 text-[11px] cursor-pointer hover:text-red-400 px-2 rounded"
              onClick={() => { setInputBuf(""); setSendQueue([]); }}
            >
              esc
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { ansiToHtml } from "../lib/ansi";
import { roomStyle } from "../lib/constants";
import { useWebSocket } from "../hooks/useWebSocket";
import { useIsMobile } from "../hooks/useMediaQuery";
import type { Session, AgentState } from "../lib/types";

interface TerminalViewProps {
  sessions: Session[];
  agents: AgentState[];
  connected: boolean;
  onSelectAgent: (agent: AgentState) => void;
}

// Raw key sequences forwarded to tmux (matches xterm escape codes)
const KEY_SEQUENCES: Record<string, string> = {
  Tab: "\t",
  Escape: "\x1b",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowLeft: "\x1b[D",
  ArrowRight: "\x1b[C",
  CtrlC: "\x03",
  CtrlD: "\x04",
};

export const TerminalView = memo(function TerminalView({ sessions, agents, connected, onSelectAgent }: TerminalViewProps) {
  const isMobile = useIsMobile();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [captureHtml, setCaptureHtml] = useState("");
  const [inputBuf, setInputBuf] = useState("");
  const [sendQueue, setSendQueue] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const selectedTargetRef = useRef<string | null>(null);
  selectedTargetRef.current = selectedTarget;

  // Mobile-only UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copyMode, setCopyMode] = useState(false);
  const [scrollAtBottom, setScrollAtBottom] = useState(true);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; file: File; url: string }[]>([]);
  const recognitionRef = useRef<any>(null);
  const inputElRef = useRef<HTMLInputElement>(null);

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
    setDrawerOpen(false);
    if (!isMobile) termRef.current?.focus();
  }, [isMobile]);

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

  // Toast helper (mobile)
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // Paste handler — fires on right-click paste or Ctrl+Shift+V (desktop)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    if (text) setInputBuf(b => b + text);
  }, []);

  // Desktop keyboard handler (preserved)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      if (!selectedTarget) return;
      const allWindows = sessions.flatMap(s => s.windows.map(w => ({ target: `${s.name}:${w.index}`, name: w.name })));
      const idx = allWindows.findIndex(w => w.target === selectedTarget);
      if (idx < 0) return;
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      const next = allWindows[(idx + dir + allWindows.length) % allWindows.length];
      selectWindow(next.target);
      return;
    }

    if (!selectedTarget) return;

    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        setInputBuf(b => b + "\n");
      } else {
        if (inputBuf) { queueSend(inputBuf); setInputBuf(""); }
      }
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) setInputBuf("");
      else setInputBuf(b => b.slice(0, -1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputBuf(""); setSendQueue([]);
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setInputBuf(""); setSendQueue([]);
    } else if ((e.key === "v" && e.ctrlKey) || (e.key === "v" && e.metaKey)) {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (text) setInputBuf(b => b + text);
      }).catch(() => {});
    } else if (e.key === "Tab") {
      e.preventDefault();
      queueSend(inputBuf + "\t");
      setInputBuf("");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setInputBuf(b => b + e.key);
    }
  }, [selectedTarget, inputBuf, queueSend, selectWindow, sessions]);

  // Mobile send (real input element submits buffer)
  const sendMobile = useCallback(() => {
    if (!selectedTarget) return;
    const text = inputBuf;
    if (!text && attachments.length === 0) return;
    if (text) queueSend(text);
    if (attachments.length > 0) {
      // Phase 2: upload + prepend paths. For now just clear + toast.
      showToast(`📎 ${attachments.length} ภาพ — รอ Phase 2 (upload API)`);
      attachments.forEach(a => URL.revokeObjectURL(a.url));
      setAttachments([]);
    }
    setInputBuf("");
  }, [selectedTarget, inputBuf, attachments, queueSend, showToast]);

  // Mobile scroll-stick tracking
  useEffect(() => {
    const out = outputRef.current;
    if (!out || !isMobile) return;
    const onScroll = () => {
      const atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 60;
      setScrollAtBottom(atBottom);
    };
    out.addEventListener("scroll", onScroll);
    return () => out.removeEventListener("scroll", onScroll);
  }, [isMobile]);

  // Voice — Web Speech API (Thai)
  const toggleVoice = useCallback(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceUnsupported(true);
      showToast("🎤 ไม่รองรับเบราว์เซอร์นี้ — ใช้ Safari/Chrome");
      return;
    }
    if (voiceActive) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "th-TH";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onstart = () => { setVoiceActive(true); showToast("🎤 ฟังอยู่... พูดเลย"); };
    rec.onresult = (e: any) => {
      const txt = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setInputBuf(txt);
    };
    rec.onend = () => setVoiceActive(false);
    rec.onerror = (e: any) => { setVoiceActive(false); showToast(`🎤 error: ${e.error}`); };
    recognitionRef.current = rec;
    rec.start();
  }, [voiceActive, showToast]);

  // File picker handler (Phase 1 stub — preview only, send gated to Phase 2)
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: { id: string; file: File; url: string }[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) { showToast(`ข้าม ${f.name} (ไม่ใช่รูป)`); continue; }
      if (f.size > 10 * 1024 * 1024) { showToast(`${f.name} ใหญ่เกิน 10MB`); continue; }
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      next.push({ id, file: f, url: URL.createObjectURL(f) });
    }
    setAttachments(prev => [...prev, ...next]);
  }, [showToast]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const a = prev.find(x => x.id === id);
      if (a) URL.revokeObjectURL(a.url);
      return prev.filter(x => x.id !== id);
    });
  }, []);

  // Smart paste — tries clipboard image, falls back to text
  const smartPaste = useCallback(async () => {
    if (!navigator.clipboard) { showToast("clipboard ไม่พร้อมใช้"); return; }
    try {
      if ((navigator.clipboard as any).read) {
        const items = await (navigator.clipboard as any).read();
        for (const item of items) {
          const imgType = item.types.find((t: string) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const file = new File([blob], `clipboard-${Date.now()}.png`, { type: imgType });
            handleFiles({ 0: file, length: 1, item: () => file } as any);
            return;
          }
        }
      }
      const txt = await navigator.clipboard.readText();
      if (txt) setInputBuf(b => b + txt);
    } catch {
      showToast("paste ถูกบล็อค");
    }
  }, [handleFiles, showToast]);

  // Get display name for selected target
  const selectedName = selectedTarget
    ? sessions.flatMap(s => s.windows.map(w => ({ target: `${s.name}:${w.index}`, name: w.name }))).find(w => w.target === selectedTarget)?.name || ""
    : "";

  // ─── DESKTOP LAYOUT (unchanged) ───────────────────────────────────
  if (!isMobile) {
    return (
      <div className="flex mx-4 sm:mx-6 mb-3 rounded-2xl overflow-hidden border border-white/[0.06]" style={{ height: "calc(100vh - 72px)" }}>
        {/* Sidebar */}
        <div className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06] overflow-y-auto" style={{ background: "#08080e" }}>
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
          className="flex-1 flex flex-col min-w-0 outline-none"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClick={() => termRef.current?.focus()}
        >
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
                {selectedTarget ? "connecting..." : "select a window ←"}
              </div>
            )}
          </div>

          {/* Input line */}
          <div
            className="flex items-start px-3 py-1.5 border-t border-white/[0.06] font-mono text-[13px] min-h-[32px]"
            style={{ background: "#0d0d14" }}
          >
            <span className="text-white/30 mr-2 mt-[1px] flex-shrink-0">&gt;</span>
            <span className="text-white/90 whitespace-pre flex-1">{inputBuf}</span>
            <span
              className="inline-block w-[7px] h-[15px] ml-[1px] flex-shrink-0"
              style={{ background: selectedTarget ? "#89b4fa" : "#333", animation: "blink 1s step-end infinite", marginTop: "2px" }}
            />
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
  }

  // ─── MOBILE LAYOUT ────────────────────────────────────────────────
  const totalWindows = sessions.reduce((acc, s) => acc + s.windows.length, 0);

  return (
    <div
      className="flex flex-col fixed inset-0"
      style={{ background: "#0a0a0f", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Header */}
      <header className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-white/5" style={{ background: "#0a0a12", minHeight: 44 }}>
        <button
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 active:bg-gray-800"
          aria-label="Open sessions drawer"
        >
          <span className="text-lg">☰</span>
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{selectedTarget || "select →"}</span>
          {selectedName && <span className="text-[10px] font-mono text-gray-500 truncate">{selectedName}</span>}
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono mr-1" style={{ color: connected ? "#4ade80" : "#f87171" }}>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: connected ? "#4ade80" : "#f87171", animation: connected ? "blink 2s infinite" : undefined }}
          />
          {connected ? "live" : "off"}
        </span>
        <button
          onClick={() => setCopyMode(m => !m)}
          className={`w-9 h-9 rounded-lg flex items-center justify-center active:bg-gray-800 ${copyMode ? "bg-amber-500/30 text-amber-300" : "text-gray-300"}`}
          aria-label="Toggle copy mode"
        >
          <span className="text-base">📋</span>
        </button>
      </header>

      {/* Copy-mode bar */}
      {copyMode && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-amber-500/30" style={{ background: "rgba(146, 64, 14, 0.3)" }}>
          <span className="font-mono text-amber-300">📋 COPY MODE</span>
          <button
            onClick={() => {
              const sel = window.getSelection()?.toString() || "";
              if (!sel) { showToast("ยังไม่ได้เลือก — long-press text ก่อน"); return; }
              navigator.clipboard.writeText(sel).then(() => showToast(`✓ คัดลอกแล้ว ${sel.length} ตัวอักษร`));
            }}
            className="px-2 py-0.5 rounded text-emerald-200 active:bg-emerald-700/60"
            style={{ background: "rgba(4, 120, 87, 0.4)" }}
          >
            ✓ copy
          </button>
          <button
            onClick={() => {
              const out = outputRef.current;
              if (!out) return;
              const prompts = out.querySelectorAll(".ansi-cyan");
              if (prompts.length > 0) {
                (prompts[prompts.length - 1] as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
                showToast("↑ jumped to prompt");
              }
            }}
            className="px-2 py-0.5 rounded text-amber-200 active:bg-amber-700/50"
            style={{ background: "rgba(146, 64, 14, 0.4)" }}
          >
            ↑ prev $
          </button>
          <button
            onClick={() => setCopyMode(false)}
            className="ml-auto px-2 py-0.5 rounded text-gray-300 active:bg-gray-700"
            style={{ background: "#1f2937" }}
          >
            esc
          </button>
        </div>
      )}

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[12px] leading-[1.4]"
        style={{
          background: copyMode ? "#1a1208" : "#0a0a0f",
          whiteSpace: "pre",
          wordBreak: "normal",
          overflowX: "auto",
          color: "#aaa",
          userSelect: copyMode ? "text" : "none",
          WebkitUserSelect: copyMode ? "text" : "none",
        }}
      >
        {captureHtml ? (
          <div dangerouslySetInnerHTML={{ __html: captureHtml }} />
        ) : (
          <div className="text-white/15 text-center mt-[30vh] text-sm">
            {selectedTarget ? "connecting..." : "tap ☰ to select a window"}
          </div>
        )}
      </div>

      {/* Floating scroll-to-bottom */}
      {!scrollAtBottom && (
        <button
          onClick={() => outputRef.current?.scrollTo(0, outputRef.current.scrollHeight)}
          className="absolute right-3 w-10 h-10 rounded-full text-white shadow-2xl active:scale-95 z-10 flex items-center justify-center"
          style={{ bottom: 140, background: "#9333ea" }}
          aria-label="Scroll to bottom"
        >
          ↓
        </button>
      )}

      {/* Assist key row */}
      <div className="flex-shrink-0 border-t border-white/5 overflow-x-auto" style={{ background: "#0d0d14", scrollbarWidth: "none" }}>
        <div className="flex gap-1 px-2 py-1.5 font-mono text-[11px]">
          <AssistKey label="Tab" onPress={() => setInputBuf(b => b + "\t")} />
          <AssistKey label="^C" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.CtrlC, force: true })} />
          <AssistKey label="^D" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.CtrlD, force: true })} />
          <AssistKey label="↑" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.ArrowUp, force: true })} />
          <AssistKey label="↓" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.ArrowDown, force: true })} />
          <AssistKey label="←" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.ArrowLeft, force: true })} />
          <AssistKey label="→" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.ArrowRight, force: true })} />
          <AssistKey label="|" onPress={() => setInputBuf(b => b + "|")} />
          <AssistKey label="/" onPress={() => setInputBuf(b => b + "/")} />
          <AssistKey label="~" onPress={() => setInputBuf(b => b + "~")} />
          <AssistKey label="Esc" onPress={() => selectedTarget && wsSend({ type: "send", target: selectedTarget, text: KEY_SEQUENCES.Escape, force: true })} />
        </div>
      </div>

      {/* Image attach strip */}
      {attachments.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/5 px-2 py-2" style={{ background: "#0d0d14" }}>
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {attachments.map(a => (
              <div key={a.id} className="relative flex-shrink-0">
                <img src={a.url} alt={a.file.name} className="w-16 h-16 rounded-lg object-cover border border-purple-500/40" />
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow active:scale-90"
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white text-center py-0.5 rounded-b-lg font-mono truncate px-1">
                  {a.file.name.slice(0, 12)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex-shrink-0 border-t border-white/5" style={{ background: "#0d0d14" }}>
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            onClick={() => document.getElementById("mobile-file-picker")?.click()}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:bg-gray-800 flex-shrink-0"
            aria-label="Attach image"
          >
            📎
          </button>
          <input
            id="mobile-file-picker"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          <span className="font-mono text-gray-500 flex-shrink-0">&gt;</span>
          <input
            ref={inputElRef}
            type="text"
            value={inputBuf}
            onChange={e => setInputBuf(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendMobile();
              }
            }}
            placeholder={selectedTarget ? "พิมพ์ หรือลากรูปลงมา..." : "เลือก window ก่อน"}
            disabled={!selectedTarget}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent font-mono text-[13px] text-white placeholder-gray-600 focus:outline-none min-w-0 disabled:opacity-50"
          />
          <button
            onClick={toggleVoice}
            disabled={voiceUnsupported}
            className={`w-9 h-9 rounded-lg flex items-center justify-center active:bg-gray-800 flex-shrink-0 ${voiceActive ? "bg-red-500/30 text-red-300" : "text-gray-400"}`}
            style={voiceActive ? { animation: "blink 1s infinite" } : undefined}
            aria-label="Voice input"
          >
            🎤
          </button>
          <button
            onClick={smartPaste}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:bg-gray-800 flex-shrink-0"
            aria-label="Smart paste"
          >
            📥
          </button>
          <button
            onClick={sendMobile}
            disabled={!selectedTarget || (!inputBuf && attachments.length === 0)}
            className="w-9 h-9 rounded-lg text-white flex items-center justify-center active:scale-95 shadow-lg flex-shrink-0 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)" }}
            aria-label="Send"
          >
            ↑
          </button>
        </div>
        {sendQueue.length > 0 && (
          <div className="px-3 pb-1 text-[10px] font-mono text-white/40">{sendQueue.length} queued</div>
        )}
      </div>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30"
          style={{ background: "rgba(0,0,0,0.6)" }}
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 left-0 bottom-0 z-40 flex flex-col border-r border-white/10 transition-transform duration-200 ease-out"
        style={{
          width: "min(288px, 80vw)",
          background: "#08080e",
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Sessions</h2>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 active:bg-gray-800"
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: "thin" }}>
          {sessions.map(session => {
            const style = roomStyle(session.name);
            return (
              <div key={session.name} className="mb-2">
                <div className="px-4 py-1 text-[10px] uppercase tracking-[1px] font-mono" style={{ color: style.accent + "B0" }}>
                  {session.name}
                </div>
                {session.windows.map(w => {
                  const target = `${session.name}:${w.index}`;
                  const isSelected = target === selectedTarget;
                  const agent = agents.find(a => a.target === target);
                  const statusColor = agent?.status === "busy" ? "#fbbf24" : agent?.status === "ready" ? "#4ade80" : "#4b5563";
                  return (
                    <button
                      key={target}
                      onClick={() => selectWindow(target)}
                      className="w-full flex items-center gap-2 px-3 py-2 active:bg-white/5"
                      style={{
                        borderLeft: isSelected ? `3px solid ${style.accent}` : "3px solid transparent",
                        background: isSelected ? `${style.accent}12` : "transparent",
                      }}
                    >
                      <span className="text-[11px] font-mono text-gray-500 w-4 text-left">{w.index}</span>
                      <span
                        className="text-[12px] font-mono flex-1 text-left truncate"
                        style={{ color: isSelected ? style.accent : "#9ca3af" }}
                      >
                        {w.name}
                      </span>
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: statusColor, boxShadow: w.active ? `0 0 4px ${statusColor}` : undefined }}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-white/5 text-[10px] font-mono text-gray-500">
          {totalWindows} windows · {sessions.length} sessions
        </div>
      </aside>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2.5 text-sm shadow-2xl z-50 font-mono rounded-xl"
          style={{ background: "#111827", border: "1px solid rgba(168, 85, 247, 0.4)", color: "#e5e7eb" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
});

interface AssistKeyProps {
  label: string;
  onPress: () => void;
}

const AssistKey = memo(function AssistKey({ label, onPress }: AssistKeyProps) {
  return (
    <button
      onClick={onPress}
      className="flex-shrink-0 px-3 py-1.5 rounded-md text-gray-200 active:bg-gray-700 border border-gray-700"
      style={{ background: "rgba(31, 41, 55, 0.8)", minHeight: 36 }}
    >
      {label}
    </button>
  );
});

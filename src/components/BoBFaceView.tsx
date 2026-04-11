import { memo, useState, useEffect, useCallback, useRef } from "react";

// 8 WALL-E emotion states (Designer Spec)
export type BobEmotion =
  | "neutral"
  | "thinking"
  | "happy"
  | "alert"
  | "confused"
  | "working"
  | "sleeping"
  | "error";

const ALL_EMOTIONS: BobEmotion[] = [
  "neutral", "thinking", "happy", "alert",
  "confused", "working", "sleeping", "error",
];

const EMOTION_LABELS: Record<BobEmotion, string> = {
  neutral: "BoB is idle",
  thinking: "BoB is thinking...",
  happy: "BoB is happy!",
  alert: "BoB is alert",
  confused: "BoB is confused",
  working: "BoB is working",
  sleeping: "BoB is sleeping",
  error: "BoB encountered an error",
};

// Emotions where pupils should NOT follow mouse
const NO_FOLLOW_EMOTIONS = new Set<BobEmotion>(["sleeping", "thinking", "confused"]);

// Debug mode: show emotion switcher only with ?debug in URL
const DEBUG = new URLSearchParams(window.location.search).has("debug");

// --- SSE hook for real-time emotion state ---
function useBoBState() {
  const [emotion, setEmotion] = useState<BobEmotion>("neutral");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/bob/state");
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.emotion && ALL_EMOTIONS.includes(data.emotion)) {
          setEmotion(data.emotion as BobEmotion);
        }
        if (data.message !== undefined) setStatusMsg(data.message);
      } catch { /* ignore */ }
    };
    es.onerror = () => setEmotion("neutral");
    return () => es.close();
  }, []);

  return { emotion, statusMsg };
}

// --- Pupil mouse-follow (constrained ±4px from center) ---
function usePupilFollow(emotion: BobEmotion) {
  const eyesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (NO_FOLLOW_EMOTIONS.has(emotion)) {
      // Reset pupils to center when entering no-follow state
      eyesRef.current?.querySelectorAll<HTMLElement>(".bob-pupil").forEach((p) => {
        p.style.transform = "translate(-50%, -50%)";
      });
      return;
    }

    const handler = (e: MouseEvent) => {
      const el = eyesRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-4, Math.min(4, (e.clientX - cx) * 0.02));
      const dy = Math.max(-4, Math.min(4, (e.clientY - cy) * 0.02));
      el.querySelectorAll<HTMLElement>(".bob-pupil").forEach((p) => {
        p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      });
    };

    document.addEventListener("mousemove", handler);
    return () => document.removeEventListener("mousemove", handler);
  }, [emotion]);

  return eyesRef;
}

// --- Idle timer ---
function useIdleTimer(
  sseEmotion: BobEmotion,
  setOverride: (e: BobEmotion | null) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasAsleep = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    wasAsleep.current = false;
    setOverride(null);
    timerRef.current = setTimeout(() => {
      wasAsleep.current = true;
      setOverride("sleeping");
    }, 5 * 60 * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sseEmotion, setOverride]);

  useEffect(() => {
    if (wasAsleep.current && sseEmotion !== "sleeping") {
      wasAsleep.current = false;
      setOverride("alert");
      const t = setTimeout(() => setOverride(null), 2000);
      return () => clearTimeout(t);
    }
  }, [sseEmotion, setOverride]);
}

// --- Chat message type ---
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// --- Chat hook (sends to BoB's tmux session, waits for response) ---
function useBoBChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [waiting, setWaiting] = useState(false);

  const send = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setWaiting(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "..." }]);

    try {
      const resp = await fetch("/api/bob/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = await resp.json();
      const content = resp.ok
        ? (data.response || "(no response)")
        : `Error: ${data.error || resp.statusText}`;

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content };
        return copy;
      });
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "Connection lost. Try again." };
        return copy;
      });
    } finally {
      setWaiting(false);
    }
  }, []);

  return { messages, streaming: waiting, send };
}

export const BoBFaceView = memo(function BoBFaceView() {
  const { emotion: sseEmotion, statusMsg } = useBoBState();
  const [manualEmotion, setManualEmotion] = useState<BobEmotion | null>(null);
  const [idleOverride, setIdleOverride] = useState<BobEmotion | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stableSetIdleOverride = useCallback(
    (e: BobEmotion | null) => setIdleOverride(e),
    [],
  );
  useIdleTimer(sseEmotion, stableSetIdleOverride);

  const { messages, streaming, send } = useBoBChat();
  const chatEmotion: BobEmotion | null = streaming ? "thinking" : null;
  const activeEmotion = manualEmotion || chatEmotion || idleOverride || sseEmotion;

  // Pupil mouse-follow
  const eyesRef = usePupilFollow(activeEmotion);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Flash happy when streaming completes
  const prevStreaming = useRef(streaming);
  useEffect(() => {
    if (prevStreaming.current && !streaming && messages.length > 0) {
      setManualEmotion("happy");
      const t = setTimeout(() => setManualEmotion(null), 3000);
      return () => clearTimeout(t);
    }
    prevStreaming.current = streaming;
  }, [streaming, messages.length]);

  // Auto-focus input after chat opens
  useEffect(() => {
    if (chatOpen) inputRef.current?.focus();
  }, [chatOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    if (!chatOpen) setChatOpen(true);
    send(text);
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#020617",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Eyes area */}
      <div
        style={{
          flex: chatOpen ? "0 0 auto" : "1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: chatOpen ? "32px 0 16px" : 0,
          transition: "all 300ms ease",
        }}
      >
        <div
          ref={eyesRef}
          className="bob-eyes"
          data-emotion={activeEmotion}
          aria-hidden="true"
          style={chatOpen ? { transform: "scale(0.8)" } : undefined}
        >
          <div className="bob-eye bob-eye--left">
            <div className="bob-pupil" />
          </div>
          <div className="bob-eye bob-eye--right">
            <div className="bob-pupil" />
          </div>
        </div>

        {/* Status message (from SSE, not chat) */}
        {statusMsg && !chatOpen && (
          <div
            style={{
              marginTop: 16,
              padding: "6px 14px",
              borderRadius: 10,
              background: "rgba(30, 41, 59, 0.7)",
              border: "1px solid rgba(51, 65, 85, 0.4)",
              color: "#94a3b8",
              fontSize: 11,
              fontFamily: "monospace",
            }}
          >
            {statusMsg}
          </div>
        )}
      </div>

      {/* Chat history */}
      {chatOpen && (
        <div
          style={{
            flex: 1,
            width: "100%",
            maxWidth: 520,
            overflowY: "auto",
            padding: "0 16px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background:
                  msg.role === "user"
                    ? "rgba(99, 102, 241, 0.25)"
                    : "rgba(30, 41, 59, 0.8)",
                border: `1px solid ${
                  msg.role === "user"
                    ? "rgba(99, 102, 241, 0.3)"
                    : "rgba(51, 65, 85, 0.4)"
                }`,
                color: msg.role === "user" ? "#c7d2fe" : "#cbd5e1",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {msg.content || (streaming && i === messages.length - 1 ? "..." : "")}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Chat input */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "12px 16px 24px",
          display: "flex",
          gap: 8,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to BoB..."
          disabled={streaming}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(51, 65, 85, 0.5)",
            background: "rgba(15, 23, 42, 0.8)",
            color: "#e2e8f0",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: 12,
            border: "none",
            background: streaming
              ? "rgba(51, 65, 85, 0.4)"
              : "rgba(99, 102, 241, 0.3)",
            color: streaming ? "#475569" : "#a5b4fc",
            fontSize: 14,
            cursor: streaming ? "not-allowed" : "pointer",
          }}
        >
          {streaming ? "..." : "Send"}
        </button>
      </form>

      {/* SR-only live region */}
      <span
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}
        aria-live="polite"
      >
        {EMOTION_LABELS[activeEmotion]}
      </span>

      {/* Debug panel: ?debug in URL to show */}
      {DEBUG && (
        <>
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              fontSize: 9,
              fontFamily: "monospace",
              color: "rgba(100, 116, 139, 0.5)",
              userSelect: "none",
            }}
          >
            {activeEmotion}
          </div>
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              maxWidth: 100,
            }}
          >
            {ALL_EMOTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setManualEmotion(e === manualEmotion ? null : e)}
                style={{
                  padding: "1px 4px",
                  borderRadius: 3,
                  fontSize: 7,
                  fontFamily: "monospace",
                  border: "none",
                  cursor: "pointer",
                  background:
                    activeEmotion === e
                      ? "rgba(71, 85, 105, 0.8)"
                      : "rgba(30, 41, 59, 0.4)",
                  color:
                    activeEmotion === e
                      ? "#e2e8f0"
                      : "rgba(100, 116, 139, 0.5)",
                  lineHeight: 1.2,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

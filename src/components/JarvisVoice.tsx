import { memo, useState, useEffect, useRef, useCallback } from "react";

const VOICE_URL_KEY = "jarvis-voice-oracle-url";

type ConnState = "disconnected" | "connecting" | "connected" | "error";
type VoiceState = "ready" | "recording" | "processing" | "speaking";

interface ChatEntry {
  role: "user" | "oracle" | "error";
  text: string;
}

export const JarvisVoice = memo(function JarvisVoice() {
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(VOICE_URL_KEY) || import.meta.env.VITE_VOICE_ORACLE_URL || "");
  const [urlInput, setUrlInput] = useState(wsUrl);
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [voiceState, setVoiceState] = useState<VoiceState>("ready");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [chatLog, streamingText, scrollToBottom]);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const drainAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setVoiceState((s) => (s === "speaking" ? "ready" : s));
      return;
    }
    isPlayingRef.current = true;
    setVoiceState("speaking");

    const ctx = getAudioCtx();
    const buf = audioQueueRef.current.shift()!;
    try {
      const decoded = await ctx.decodeAudioData(buf);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);
      source.onended = () => drainAudioQueue();
      source.start();
    } catch {
      drainAudioQueue();
    }
  }, [getAudioCtx]);

  const handleAudioBlob = useCallback(
    async (blob: Blob) => {
      const ab = await blob.arrayBuffer();
      audioQueueRef.current.push(ab);
      if (!isPlayingRef.current) drainAudioQueue();
    },
    [drainAudioQueue],
  );

  const connectWs = useCallback(
    (url: string) => {
      if (!url) return;
      wsRef.current?.close();

      const wsProto = url.startsWith("https") ? "wss" : url.startsWith("http") ? "ws" : url.startsWith("wss") ? "wss" : "ws";
      const wsHost = url.replace(/^https?:\/\//, "").replace(/^wss?:\/\//, "").replace(/\/$/, "");
      const fullUrl = `${wsProto}://${wsHost}/ws/voice`;

      setConn("connecting");
      const socket = new WebSocket(fullUrl);
      socket.binaryType = "blob";

      socket.onopen = () => setConn("connected");
      socket.onclose = () => {
        setConn("disconnected");
        setVoiceState("ready");
      };
      socket.onerror = () => setConn("error");

      socket.onmessage = (event) => {
        if (event.data instanceof Blob) {
          handleAudioBlob(event.data);
        } else {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "transcript":
              setChatLog((prev) => [...prev, { role: "user", text: msg.text }]);
              setStreamingText("");
              break;
            case "token":
              setStreamingText((prev) => prev + msg.text);
              break;
            case "done":
              setStreamingText((prev) => {
                if (prev) setChatLog((log) => [...log, { role: "oracle", text: prev }]);
                return "";
              });
              setVoiceState((s) => (s !== "speaking" ? "ready" : s));
              break;
            case "status":
              if (msg.text === "transcribing") setVoiceState("processing");
              else if (msg.text === "thinking") setVoiceState("processing");
              else if (msg.text === "ready" && !isPlayingRef.current) setVoiceState("ready");
              break;
            case "error":
              setChatLog((prev) => [...prev, { role: "error", text: msg.text }]);
              setVoiceState("ready");
              break;
          }
        }
      };

      wsRef.current = socket;
    },
    [handleAudioBlob],
  );

  useEffect(() => {
    if (wsUrl) connectWs(wsUrl);
    return () => wsRef.current?.close();
  }, [wsUrl, connectWs]);

  const startRecording = useCallback(async () => {
    if (voiceState !== "ready") return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    getAudioCtx();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = (e) => {
      if (e.data?.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(blob);
        setVoiceState("processing");
      }
    };

    rec.start();
    recorderRef.current = rec;
    setVoiceState("recording");
  }, [voiceState, getAudioCtx]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (voiceState === "recording") stopRecording();
    else startRecording();
  }, [voiceState, startRecording, stopRecording]);

  const applyUrl = useCallback(() => {
    setWsUrl(urlInput);
    localStorage.setItem(VOICE_URL_KEY, urlInput);
  }, [urlInput]);

  const connColor = conn === "connected" ? "#4caf50" : conn === "connecting" ? "#ffaa00" : conn === "error" ? "#ef5350" : "#666";
  const micColors: Record<VoiceState, { bg: string; border: string; shadow: string }> = {
    ready: { bg: "#1a1a2e", border: "#2a2a4a", shadow: "none" },
    recording: { bg: "#3a1a1a", border: "#ff4444", shadow: "0 0 24px rgba(255,68,68,0.3)" },
    processing: { bg: "#2a2a1a", border: "#ffaa00", shadow: "0 0 24px rgba(255,170,0,0.2)" },
    speaking: { bg: "#1a2a1a", border: "#44cc88", shadow: "0 0 24px rgba(68,204,136,0.2)" },
  };
  const mic = micColors[voiceState];

  return (
    <div className="flex-1 flex flex-col gap-2" style={{ minHeight: 400 }}>
      {/* URL input */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: connColor }} />
          <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">
            {conn === "connected" ? "Live" : conn === "connecting" ? "..." : "Off"}
          </span>
        </div>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyUrl()}
          placeholder="wss://hostname:8080 or http://localhost:8080"
          className="flex-1 px-2 py-1 text-xs font-mono bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-blue-400/40"
        />
        <button
          onClick={applyUrl}
          className="px-3 py-1 text-xs font-medium rounded transition-all"
          style={{ background: "rgba(74,158,255,0.15)", color: "#4a9eff", border: "1px solid rgba(74,158,255,0.3)" }}
        >
          Connect
        </button>
      </div>

      {/* Main area: mic + chat */}
      <div className="flex-1 flex flex-col rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: "#0a0a12" }}>
        {/* Mic stage */}
        <div className="flex flex-col items-center py-6 gap-3 border-b border-white/[0.04]">
          <button
            onMouseDown={!isMobile ? startRecording : undefined}
            onMouseUp={!isMobile ? stopRecording : undefined}
            onMouseLeave={!isMobile ? () => voiceState === "recording" && stopRecording() : undefined}
            onClick={isMobile ? toggleRecording : undefined}
            disabled={conn !== "connected" || (voiceState !== "ready" && voiceState !== "recording")}
            className="relative w-20 h-20 rounded-full transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: mic.bg,
              border: `2px solid ${mic.border}`,
              boxShadow: mic.shadow,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 mx-auto text-white/80">
              <rect x="9" y="1" width="6" height="13" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="23" x2="12" y2="17" />
            </svg>
          </button>
          <span className="text-xs font-mono" style={{ color: mic.border === "#2a2a4a" ? "rgba(255,255,255,0.3)" : mic.border }}>
            {voiceState === "ready" && (isMobile ? "Tap to talk" : "Hold to talk")}
            {voiceState === "recording" && "🎤 Listening…"}
            {voiceState === "processing" && "Thinking…"}
            {voiceState === "speaking" && "Speaking…"}
          </span>
        </div>

        {/* Chat log */}
        <div className="flex-1 overflow-y-auto px-3 py-2" style={{ maxHeight: "calc(100vh - 480px)", overscrollBehavior: "contain" }}>
          {chatLog.length === 0 && !streamingText && (
            <div className="flex items-center justify-center text-white/15 text-sm font-mono py-12">
              {conn === "connected" ? (isMobile ? "Tap mic to start" : "Hold mic or press Space") : "Enter Voice Oracle URL to connect"}
            </div>
          )}
          {chatLog.map((entry, i) => (
            <div key={i} className="mb-2">
              <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: entry.role === "user" ? "#4a9eff" : entry.role === "oracle" ? "#44cc88" : "#ff4444" }}>
                {entry.role === "user" ? "You" : entry.role === "oracle" ? "Oracle" : "Error"}
              </div>
              <div className="text-sm text-white/70 leading-relaxed">{entry.text}</div>
            </div>
          ))}
          {streamingText && (
            <div className="mb-2">
              <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "#44cc88" }}>Oracle</div>
              <div className="text-sm text-white/70 leading-relaxed">{streamingText}<span className="animate-pulse">▌</span></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-[10px] text-white/25 font-mono px-1">
        🎙 Voice Oracle — {isMobile ? "tap mic" : "hold mic / spacebar"} to talk. WebSocket to FastAPI + Groq STT + Claude + ElevenLabs TTS.
      </div>
    </div>
  );
});

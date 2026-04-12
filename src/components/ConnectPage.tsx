import { memo, useState, useEffect } from "react";

const STORAGE_KEY = "maw-recent-hosts";
const MAX_RECENT = 5;

function getRecentHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHost(host: string) {
  const recent = getRecentHosts().filter((h) => h !== host);
  recent.unshift(host);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

/**
 * ConnectPage — shown when maw-ui has no backend connection.
 *
 * On hosted origins (god.buildwithoracle.com) without ?host=, every /api
 * call fails. Instead of showing empty views, show this: one input field,
 * paste any maw-js address, test the connection, redirect on success.
 *
 * Inspired by natman95's LandingPage.tsx visual bones (PR #4) — stripped
 * of pricing/signup/trials. Just: connect and go.
 */
export const ConnectPage = memo(function ConnectPage() {
  const [host, setHost] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(getRecentHosts());
  }, []);

  const connect = async (target: string) => {
    const trimmed = target.trim();
    if (!trimmed) return;

    setTesting(true);
    setError("");

    // Normalize: add http:// if no protocol
    const normalized = trimmed.match(/^https?:\/\//) ? trimmed : `http://${trimmed}`;

    try {
      const res = await fetch(`${normalized}/api/config`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (!data.node) throw new Error("not a maw-js node");

      // Success — save + redirect
      saveHost(normalized);
      const currentHash = window.location.hash || "#office";
      window.location.href = `${window.location.pathname}?host=${encodeURIComponent(normalized)}${currentHash}`;
    } catch (e: any) {
      setError(
        e.name === "TimeoutError"
          ? "Connection timed out — is the address correct?"
          : e.message?.includes("Failed to fetch")
            ? "Can't reach that address — check the URL and try again"
            : `Connection failed: ${e.message}`,
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#020a18" }}>
      <div className="w-full max-w-md text-center">
        {/* Hero */}
        <div className="text-4xl mb-4">👁</div>
        <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: "#00f5d4" }}>
          maw-ui
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.35)" }}>
          Connect to any maw-js node to see the mesh
        </p>

        {/* Input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && connect(host)}
            placeholder="localhost:3456 or 10.20.0.7:3456"
            className="flex-1 px-4 py-3 rounded-xl text-sm font-mono outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.8)",
              border: `1px solid ${error ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
            }}
            autoFocus
            disabled={testing}
          />
          <button
            onClick={() => connect(host)}
            disabled={testing || !host.trim()}
            className="px-5 py-3 rounded-xl text-sm font-mono font-bold transition-all hover:scale-105 disabled:opacity-30"
            style={{
              background: "rgba(0,245,212,0.1)",
              color: "#00f5d4",
              border: "1px solid rgba(0,245,212,0.25)",
            }}
          >
            {testing ? "..." : "Go"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400/70 mb-3">{error}</div>
        )}

        {/* Recent hosts */}
        {recent.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] font-mono text-white/20 mb-2">RECENT</div>
            <div className="space-y-1">
              {recent.map((h) => (
                <button
                  key={h}
                  onClick={() => connect(h)}
                  disabled={testing}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all hover:bg-white/[0.05]"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hint */}
        <div className="mt-8 text-[10px] text-white/15 space-y-1">
          <p>Run <span className="text-white/25 font-mono">maw ui --tunnel &lt;peer&gt;</span> for SSH tunnel command</p>
          <p>Or open <span className="text-white/25 font-mono">http://localhost:3456/</span> directly if local</p>
        </div>
      </div>
    </div>
  );
});

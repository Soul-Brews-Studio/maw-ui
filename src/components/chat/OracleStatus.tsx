import { useState, useEffect } from "react";
import { apiUrl } from "../../lib/api";

const STATUS_COLORS: Record<string, string> = {
  busy: "#4caf50",
  ready: "#fbbf24",
  idle: "#64748b",
  offline: "#ef4444",
};

export function OracleStatus({ oracle }: { oracle: string }) {
  const [status, setStatus] = useState<string>("...");

  useEffect(() => {
    let alive = true;
    const poll = () => {
      fetch(apiUrl(`/api/dispatch/status/${encodeURIComponent(oracle)}`))
        .then(r => r.json())
        .then(d => { if (alive) setStatus(d.status || "offline"); })
        .catch(() => { if (alive) setStatus("offline"); });
    };
    poll();
    const iv = setInterval(poll, 10_000);
    return () => { alive = false; clearInterval(iv); };
  }, [oracle]);

  const color = STATUS_COLORS[status] || "#64748b";

  return (
    <span className="inline-flex items-center gap-1" title={`${oracle}: ${status}`}>
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: color,
          boxShadow: status === "busy" ? `0 0 6px ${color}` : "none",
          animation: status === "busy" ? "agent-pulse 1.5s ease-in-out infinite" : "none",
        }}
      />
      <span className="text-[9px] font-mono" style={{ color: `${color}99` }}>{status}</span>
    </span>
  );
}

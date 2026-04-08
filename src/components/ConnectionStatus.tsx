import { useWebSocket } from "../hooks/useWebSocket";
import { useCallback } from "react";

const noop = () => {};

/**
 * Small WS connection status indicator.
 * Green dot = connected, yellow = reconnecting, red = disconnected.
 * Can be placed anywhere in the UI — uses the shared singleton connection.
 */
export function ConnectionStatus({ className }: { className?: string }) {
  const { connected, reconnecting } = useWebSocket(noop);

  const color = connected
    ? "#22c55e"
    : reconnecting
      ? "#fbbf24"
      : "#ef4444";

  const label = connected
    ? "Connected"
    : reconnecting
      ? "Reconnecting..."
      : "Disconnected";

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className || ""}`}
      title={label}
    >
      <div
        className={`w-2 h-2 rounded-full${reconnecting ? " animate-pulse" : ""}`}
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span
        className="font-mono text-[10px]"
        style={{ color: `${color}cc` }}
      >
        {label}
      </span>
    </div>
  );
}

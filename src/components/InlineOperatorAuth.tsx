import { useEffect, useRef, useState, type FormEvent } from "react";
import { authenticateOperator, getActiveBackendOrigin } from "../lib/api";

type Status = "idle" | "checking" | "unauthorized" | "forbidden" | "unavailable" | "invalid_response";

const MESSAGE: Record<Exclude<Status, "idle" | "checking">, string> = {
  unauthorized: "Token rejected by this host.",
  forbidden: "This origin is not allowed by the backend.",
  unavailable: "Operator host unavailable.",
  invalid_response: "Unexpected response — not a maw operator endpoint?",
};

/**
 * Compact operator sign-in, shown only after the backend has actually refused a
 * WebSocket upgrade.
 *
 * Why inline rather than a startup gate: an OPEN_MODE build deliberately has no
 * gate, which is right for a backend that does not want auth. But maw-rs
 * v26.8.18+ refuses browser upgrades without a ticket, and a ticket needs a
 * credential — so such a build could never recover, and simply sat at zero
 * agents. Prompting on refusal keeps the zero-friction path for backends that
 * don't need auth, and offers the way out for backends that do.
 *
 * Direction of failure matters: auth is only ever ADDED in response to a
 * refusal. Nothing here lets a server talk us OUT of authenticating, which is
 * the bypass shape #111 was about. The token is sent only to the origin the
 * operator selected, by `authenticateOperator`'s exact-origin path.
 */
export function InlineOperatorAuth() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const attempt = useRef<AbortController | null>(null);
  const origin = getActiveBackendOrigin();

  useEffect(() => () => attempt.current?.abort(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    setStatus("checking");
    const outcome = await authenticateOperator(token, controller.signal);
    setToken("");
    // On success the credential lands in memory; useWebSocket reconnects on the
    // subscription and clears the banner itself. Nothing to do here.
    if (outcome === "authenticated" || outcome === "aborted" || outcome === "stale") return;
    setStatus(outcome);
  };

  return (
    <form onSubmit={submit} className="mt-2 flex items-center gap-2">
      <input
        type="password"
        value={token}
        onChange={e => setToken(e.target.value)}
        disabled={status === "checking"}
        autoComplete="off"
        aria-label="Operator token"
        placeholder={origin ? `operator token for ${new URL(origin).host}` : "operator token"}
        className="flex-1 min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white outline-none disabled:opacity-40"
      />
      <button
        disabled={!token || status === "checking"}
        className="shrink-0 rounded border border-cyan-400/30 px-3 py-1 font-mono text-[11px] text-cyan-300 disabled:opacity-30"
      >
        {status === "checking" ? "Checking…" : "Authenticate"}
      </button>
      {status !== "idle" && status !== "checking" && (
        <span className="shrink-0 font-mono text-[10px] text-red-400">{MESSAGE[status]}</span>
      )}
    </form>
  );
}

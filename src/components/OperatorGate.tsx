import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ConnectPage } from "./ConnectPage";
import { authenticateOperator, canonicalizeBackendOrigin, clearStoredHost, getStoredHost,
  hasOperatorCredential, subscribeOperatorCredential, type OperatorAuthOutcome } from "../lib/api";

const messages: Record<Exclude<OperatorAuthOutcome, "authenticated">, string> = {
  unauthorized: "Operator credential rejected.",
  forbidden: "Origin or operator policy rejected this request.",
  unavailable: "Backend unavailable.",
  invalid_response: "Verification response rejected.",
  aborted: "Verification cancelled.",
  stale: "A newer verification attempt replaced this one.",
};
export function OperatorGate({ onReady }: { onReady: () => void }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"locked" | "checking" | OperatorAuthOutcome>("locked");
  const attempt = useRef<AbortController | null>(null);
  const ready = useRef(false);
  const verified = useSyncExternalStore(subscribeOperatorCredential, hasOperatorCredential, () => false);
  useEffect(() => () => attempt.current?.abort(), []);
  useEffect(() => {
    if (verified && !ready.current) {
      ready.current = true;
      onReady();
    }
  }, [verified, onReady]);

  const stored = getStoredHost();
  const hosted = !stored && location.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  let origin = "";
  let hostError: "invalid" | "mixed" | null = null;
  try {
    const selected = canonicalizeBackendOrigin(stored ?? location.origin, location.protocol);
    origin = selected.exactOrigin;
    if (selected.mixedContent) hostError = "mixed";
  } catch { hostError = "invalid"; }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    setStatus("checking");
    const timeout = setTimeout(() => controller.abort(), 8000);
    const result = await authenticateOperator(token, controller.signal);
    clearTimeout(timeout);
    if (attempt.current !== controller) return;
    attempt.current = null;
    setToken("");
    setStatus(result);
  };

  if (hostError) return <main className="min-h-screen grid place-items-center bg-[#020a18] text-center text-white/60">
    <div><p>{hostError === "mixed" ? "HTTPS cannot connect to an HTTP backend." : "Invalid backend selection."}</p>
      {origin && <p className="font-mono text-xs mt-2">{origin}</p>}
      <button className="mt-5 text-cyan-300" onClick={() => { clearStoredHost(); location.reload(); }}>Clear backend and reload</button></div>
  </main>;
  if (hosted) return <ConnectPage />;
  return <main className="min-h-screen grid place-items-center bg-[#020a18] text-center text-white/60">
    <form onSubmit={submit} className="w-full max-w-sm px-6">
      <h1 className="text-xl text-cyan-300">Operator access</h1>
      <p className="font-mono text-xs my-4">{origin}</p>
      <input type="password" value={token} onChange={event => setToken(event.target.value)}
        autoComplete="off" spellCheck={false} disabled={status === "checking" || verified}
        className="w-full rounded border border-white/10 bg-white/5 p-3" aria-label="Operator credential" />
      <button disabled={!token || status === "checking" || verified} className="mt-3 text-cyan-300">Verify</button>
      <p className="mt-4 text-xs" role="status">{status === "checking" ? "Verifying…"
        : status === "authenticated" ? "Opening…" : status === "locked" ? "Credential required."
          : messages[status]}</p>
    </form>
  </main>;
}

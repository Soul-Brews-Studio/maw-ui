import { createElement, type ComponentType, type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { authenticateOperator, canonicalizeBackendOrigin, clearOperatorCredential,
  getActiveBackendOrigin, hasOperatorCredential, setStoredHost, subscribeOperatorCredential } from "../lib/api";
import "../index.css";

type Loader = () => Promise<{ default: ComponentType }>;
const authSnapshot = () => hasOperatorCredential();

// Build-time only — never a runtime/server-reported signal. maw-rs's own
// "open mode" (no-token-required, backward-compatible) cannot be trusted
// client-side at runtime: an attacker's server could claim the same thing
// (this is exactly the class of bypass #80's invariants forbid). This flag
// instead controls what SHIPS in a given build: unset (the default, used
// for god.buildwithoracle.com) compiles the gate in; set at build time for
// a distinct, separately-built deployment (e.g. a local/archived maw-js
// setup you fully control end to end) compiles it out entirely — Vite
// statically replaces import.meta.env.VITE_* so the gated build never
// contains this branch or the open-mode code path.
const OPEN_MODE = import.meta.env.VITE_OPEN_MODE === "1";

function Application({ load }: { load: Loader }) {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => { let current = true; load().then(module => { if (current) setApp(() => module.default); });
    return () => { current = false; }; }, [load]);
  return App ? createElement(App) : <GateFrame>Loading…</GateFrame>;
}

function GateFrame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "#020208", color: "#d7e3f4" }}>
    <section className="w-full max-w-md rounded-xl border border-white/10 p-6 font-mono bg-white/[0.03]">{children}</section>
  </main>;
}

function OperatorGate({ load }: { load: Loader }) {
  const ready = useSyncExternalStore(subscribeOperatorCredential, authSnapshot, () => false);
  const [token, setToken] = useState("");
  const [host, setHost] = useState("");
  const [selectingHost, setSelectingHost] = useState(false);
  const [status, setStatus] = useState<"locked" | "checking" | "unauthorized" | "forbidden" | "unavailable" | "invalid_response">("locked");
  const origin = getActiveBackendOrigin();
  const attempt = useRef<AbortController | null>(null);
  useEffect(() => () => { attempt.current?.abort(); clearOperatorCredential(); }, []);

  if (ready) return <Application load={load} />;
  const submitToken = async (event: FormEvent) => {
    event.preventDefault();
    attempt.current?.abort();
    const controller = new AbortController();
    attempt.current = controller;
    setStatus("checking");
    const outcome = await authenticateOperator(token, controller.signal);
    setToken("");
    if (outcome !== "authenticated" && outcome !== "aborted" && outcome !== "stale") setStatus(outcome);
  };
  const submitHost = (event: FormEvent) => {
    event.preventDefault();
    try {
      const next = canonicalizeBackendOrigin(host, window.location.protocol);
      if (next.mixedContent) { setStatus("invalid_response"); return; }
      setStoredHost(next.exactOrigin);
      window.location.reload();
    } catch { setStatus("invalid_response"); }
  };
  if (selectingHost || !origin) return <GateFrame>
    <h1 className="mb-4 text-lg text-cyan-300">Select operator host</h1>
    <form onSubmit={submitHost} className="space-y-3">
      <input value={host} onChange={e => setHost(e.target.value)} autoComplete="off" autoFocus
        className="w-full rounded border border-white/10 bg-black/30 p-3" placeholder="https://host:3456" />
      {status === "invalid_response" && <p className="text-xs text-red-400">Use a valid HTTPS origin. HTTPS pages cannot connect to HTTP backends.</p>}
      <button className="rounded border border-cyan-400/30 px-4 py-2 text-cyan-300">Continue</button>
    </form>
  </GateFrame>;
  return <GateFrame>
    <h1 className="mb-1 text-lg text-cyan-300">Operator authentication</h1>
    <p className="mb-5 break-all text-xs text-white/50">{origin}</p>
    <form onSubmit={submitToken} className="space-y-3">
      <input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" autoFocus
        disabled={status === "checking"} className="w-full rounded border border-white/10 bg-black/30 p-3" aria-label="Operator token" />
      {status !== "locked" && status !== "checking" && <p className="text-xs text-red-400">{status === "unauthorized" ? "Token rejected." : status === "forbidden" ? "Origin forbidden." : status === "unavailable" ? "Operator host unavailable." : "Invalid authentication response."}</p>}
      <div className="flex gap-2"><button disabled={!token || status === "checking"} className="rounded border border-cyan-400/30 px-4 py-2 text-cyan-300 disabled:opacity-40">{status === "checking" ? "Checking…" : "Unlock"}</button>
        <button type="button" onClick={() => setSelectingHost(true)} className="px-3 text-xs text-white/40">Change host</button></div>
    </form>
  </GateFrame>;
}

export function mount(load: Loader) {
  createRoot(document.getElementById("root")!).render(OPEN_MODE ? <Application load={load} /> : <OperatorGate load={load} />);
}

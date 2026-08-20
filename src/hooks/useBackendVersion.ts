import { useEffect, useState } from "react";
import { apiFetch, subscribeOperatorCredential } from "../lib/api";

export interface BackendInfo {
  version: string;
  node?: string;
  host?: string;
}

/**
 * The maw-rs version actually serving this UI.
 *
 * Worth surfacing because the daemon version is the single best predictor of
 * how the UI will behave, and it is invisible from the browser otherwise. The
 * binary on disk, the running daemon, and the deployed UI can all disagree —
 * a daemon keeps its old version until restarted, which is exactly what made a
 * backend upgrade look like a frontend bug on 2026-08-20.
 *
 * Fetched once per credential change rather than polled: the value only moves
 * when someone restarts the daemon, and re-auth is the moment it is worth
 * re-reading (a different host may be answering).
 */
export function useBackendVersion(): BackendInfo | null {
  const [info, setInfo] = useState<BackendInfo | null>(null);

  useEffect(() => {
    let alive = true;

    const load = () => {
      apiFetch("/api/identity")
        .then(r => (r.ok ? r.json() : null))
        .then((d: unknown) => {
          if (!alive || !d || typeof d !== "object") return;
          const v = d as { version?: unknown; node?: unknown; host?: unknown };
          if (typeof v.version !== "string") return;
          setInfo({
            version: v.version,
            node: typeof v.node === "string" ? v.node : undefined,
            host: typeof v.host === "string" ? v.host : undefined,
          });
        })
        .catch(() => {}); // apiFetch is fail-closed pre-auth; a miss is not an error
    };

    load();
    const unsubscribe = subscribeOperatorCredential(load);
    return () => { alive = false; unsubscribe(); };
  }, []);

  return info;
}

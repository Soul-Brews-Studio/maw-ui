/**
 * Visibility helpers — stop background tabs from generating traffic.
 *
 * Every dashboard interval used to tick in hidden tabs forever; with the
 * user's real pattern of several permanently-open tabs that multiplied
 * every poller by tab count. These helpers make "pause when hidden" a
 * one-line change.
 */
import { useEffect, useRef } from "react";

/** True when the document is currently visible (SSR-safe). */
export function isVisible(): boolean {
  return typeof document === "undefined" || !document.hidden;
}

/**
 * setInterval that skips ticks while the tab is hidden and fires once
 * immediately when the tab becomes visible again (so stale views refresh
 * right away instead of waiting a full period).
 */
export function useVisibleInterval(fn: () => void, ms: number): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const tick = () => { if (isVisible()) fnRef.current(); };
    const iv = setInterval(tick, ms);
    const onVis = () => { if (isVisible()) fnRef.current(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms]);
}

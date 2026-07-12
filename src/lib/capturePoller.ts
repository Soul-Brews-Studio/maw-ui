/**
 * capturePoller — one shared scheduler for every /api/capture consumer.
 *
 * Replaces the per-component poll loops (OverviewGrid tiles 2s, MiniMonitor
 * 500ms, VSAgentPanel 300ms, iPadDashboard 1.5s, …). Each ran its own
 * setTimeout chain, so N visible tiles = N independent request streams —
 * compact overview (50+ tiles visible) turned that into a request flood.
 *
 * Guarantees:
 * - subscribers of the same target share one in-flight request and one frame
 * - global concurrency cap; next poll is scheduled from completion, so
 *   requests self-stagger instead of aligning into bursts
 * - adaptive back-off: unchanged content stretches the interval up to
 *   MAX_INTERVAL; a content change snaps it back to the subscriber base
 * - document.hidden pauses everything — a background tab makes 0 requests
 */
import { apiFetch } from "./api";

type Listener = (content: string) => void;

interface Entry {
  target: string;
  listeners: Map<Listener, number>; // listener → its base interval (ms)
  interval: number; // current adaptive interval
  due: number; // timestamp of next allowed poll
  inFlight: boolean;
  last: string;
  lastFetched: number;
}

const MAX_INTERVAL = 10_000;
const MAX_CONCURRENT = 6;
const TICK_MS = 250;

const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlightCount = 0;

function baseOf(e: Entry): number {
  let min = Infinity;
  for (const base of e.listeners.values()) min = Math.min(min, base);
  return min === Infinity ? 2000 : min;
}

function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  const now = Date.now();
  for (const e of entries.values()) {
    if (inFlightCount >= MAX_CONCURRENT) break;
    if (e.inFlight || now < e.due) continue;
    e.inFlight = true;
    inFlightCount++;
    apiFetch(`/api/capture?target=${encodeURIComponent(e.target)}`)
      .then((r) => r.json())
      .then((d) => {
        const text = d.content || "";
        e.interval = text === e.last ? Math.min(e.interval * 1.5, MAX_INTERVAL) : baseOf(e);
        e.last = text;
        e.lastFetched = Date.now();
        for (const l of e.listeners.keys()) l(text);
      })
      .catch(() => {
        // circuit breaker in apiFetch handles hard failures; just back off
        e.interval = Math.min(e.interval * 2, MAX_INTERVAL);
      })
      .finally(() => {
        e.inFlight = false;
        inFlightCount--;
        e.due = Date.now() + e.interval;
      });
  }
}

function ensureTimer() {
  if (!timer && entries.size > 0) timer = setInterval(tick, TICK_MS);
  if (timer && entries.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Subscribe to live capture frames for a tmux target.
 * `baseMs` is this subscriber's desired refresh; the shared entry polls at
 * the fastest base among subscribers, stretching when content is static.
 * Returns an unsubscribe function. New subscribers get the cached frame
 * immediately (if any), so tiles render without waiting a full cycle.
 */
export function subscribeCapture(target: string, listener: Listener, baseMs = 2000): () => void {
  let e = entries.get(target);
  if (!e) {
    e = { target, listeners: new Map(), interval: baseMs, due: 0, inFlight: false, last: "", lastFetched: 0 };
    entries.set(target, e);
  }
  e.listeners.set(listener, baseMs);
  if (baseMs < e.interval) {
    e.interval = baseMs;
    e.due = Math.min(e.due, Date.now() + baseMs);
  }
  if (e.last) listener(e.last);
  ensureTimer();
  return () => {
    const entry = entries.get(target);
    if (!entry) return;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) entries.delete(target);
    ensureTimer();
  };
}

/**
 * One-shot frame (hover previews, mount snapshots). Reuses a recent shared
 * frame when available instead of issuing a new request.
 */
export function fetchCaptureOnce(target: string, maxAgeMs = 3000): Promise<string> {
  const e = entries.get(target);
  if (e && e.last && Date.now() - e.lastFetched < maxAgeMs) return Promise.resolve(e.last);
  return apiFetch(`/api/capture?target=${encodeURIComponent(target)}`)
    .then((r) => r.json())
    .then((d) => d.content || "");
}

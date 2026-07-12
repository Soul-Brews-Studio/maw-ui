/**
 * Centralized API host resolution — local.drizzle.studio pattern.
 *
 * Loaded from CF (local.buildwithoracle.com): user passes ?host=white.local:3456
 *   Server auto-detects mkcert and serves HTTPS (same as drizzle-kit).
 * Loaded locally (same origin): uses relative paths.
 *
 * The host param accepts THREE forms:
 *
 *   ?host=white.local:3456              → https://white.local:3456
 *                                         (bare host:port — defaults to https,
 *                                         backwards-compatible behavior)
 *
 *   ?host=https://white.local:3456      → https://white.local:3456
 *                                         (explicit https — same result)
 *
 *   ?host=http://oracle-world:3456      → http://oracle-world:3456
 *                                         (explicit http — needed for plain-HTTP
 *                                         maw-js nodes on the LAN, e.g. oracle-world
 *                                         where mkcert isn't deployed)
 *
 * Discovered the http:// gap during /lens smoke testing on 2026-04-11:
 * the v1.1 PR claimed "the lens reads any maw-js" but the apiUrl helper
 * hardcoded https://, so any HTTP-only node was unreachable. This restores
 * the claim. See ψ/memory/feedback_ground_before_proposing.md (claim drift —
 * incident #5 in the night's count).
 */

const STORAGE_KEY = "maw-host";
const RECENT_KEY = "maw-host-recent";

const params = new URLSearchParams(window.location.search);
const urlHost = params.get("host");

// Auto-persist: ?host= in URL → save to localStorage → redirect clean
if (urlHost) {
  localStorage.setItem(STORAGE_KEY, urlHost);
  addRecentHost(urlHost);
  const url = new URL(window.location.href);
  url.searchParams.delete("host");
  window.location.replace(url.toString());
}

const hostParam = localStorage.getItem(STORAGE_KEY);

/** Whether we're running in remote mode */
export const isRemote = !!hostParam;

/** Where the active host came from (always "config" or "local" after redirect) */
export const hostSource: "config" | "local" =
  localStorage.getItem(STORAGE_KEY) ? "config" : "local";

/** Raw active host value (from URL or config) */
export const activeHost: string | null = hostParam;

/** Read stored host from config */
export function getStoredHost(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/** Save host to config + add to recent list */
export function setStoredHost(host: string): void {
  localStorage.setItem(STORAGE_KEY, host);
  addRecentHost(host);
}

/** Clear stored host (revert to local) */
export function clearStoredHost(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Get recent hosts list */
export function getRecentHosts(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch { return []; }
}

function addRecentHost(host: string): void {
  const recent = getRecentHosts().filter(h => h !== host);
  recent.unshift(host);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
}

/** Resolved {protocol, host:port} from `hostParam`, or null if same-origin. */
function resolveHost(): { httpProto: string; wsProto: string; host: string } | null {
  if (!hostParam) return null;
  // Strip trailing slash — browsers often append one to the URL, which
  // causes double-slash in constructed paths: "localhost:3456/" + "/api/config"
  // → "localhost:3456//api/config". The double-slash misses the CORS middleware
  // (mounted on "/api/*", not "//api/*") and breaks everything.
  if (hostParam.startsWith("https://")) {
    return { httpProto: "https:", wsProto: "wss:", host: hostParam.slice("https://".length).replace(/\/+$/, "") };
  }
  if (hostParam.startsWith("http://")) {
    return { httpProto: "http:", wsProto: "ws:", host: hostParam.slice("http://".length).replace(/\/+$/, "") };
  }
  // Bare host:port — default to https for backwards compatibility.
  return { httpProto: "https:", wsProto: "wss:", host: hostParam.replace(/\/+$/, "") };
}

/** Build full URL for fetch() calls */
export function apiUrl(path: string): string {
  const r = resolveHost();
  if (!r) return path;
  return `${r.httpProto}//${r.host}${path}`;
}

/** WebSocket URL */
export function wsUrl(path: string): string {
  const r = resolveHost();
  if (!r) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}${path}`;
  }
  return `${r.wsProto}//${r.host}${path}`;
}

// ────────────────────────────────────────────────────────────────────────
// apiFetch — circuit-breaker wrapper around fetch.
//
// Why: when host is unreachable (LAN down, Chrome PNA blocking HTTP from an
// HTTPS context, DNS gone) the dashboard's six pollers will fire thousands of
// requests/minute, all failing silently. apiFetch trips a circuit after N
// consecutive failures and short-circuits further calls for OPEN_MS, with one
// half-open probe to test recovery. Health is exposed so the UI can banner.
// ────────────────────────────────────────────────────────────────────────

const FAIL_THRESHOLD = 5;
const OPEN_MS = 30_000;

type Health = {
  healthy: boolean;          // false once circuit trips
  consecutiveFails: number;
  openUntil: number;         // timestamp; 0 when closed
  lastError: string | null;
};

let healthSnapshot: Health = { healthy: true, consecutiveFails: 0, openUntil: 0, lastError: null };
const listeners = new Set<() => void>();

function commit(next: Partial<Health>) {
  const merged = { ...healthSnapshot, ...next };
  if (merged.healthy === healthSnapshot.healthy
      && merged.consecutiveFails === healthSnapshot.consecutiveFails
      && merged.openUntil === healthSnapshot.openUntil
      && merged.lastError === healthSnapshot.lastError) return;
  healthSnapshot = merged;
  listeners.forEach(l => l());
}

export function getHttpHealth(): Health {
  return healthSnapshot;
}

export function subscribeHttpHealth(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Force-close the circuit (e.g. after user changes host). */
export function resetHttpHealth(): void {
  commit({ healthy: true, consecutiveFails: 0, openUntil: 0, lastError: null });
}

// Is the active host private (LAN / localhost / .local)?
// Chrome 142+ requires targetAddressSpace: 'local' on such fetches from HTTPS.
function isPrivateHost(): boolean {
  const r = resolveHost();
  if (!r) return false;
  const host = r.host.split(":")[0].toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

/**
 * Drop-in fetch wrapper. Same signature, plus:
 *   - Trips a circuit breaker after FAIL_THRESHOLD consecutive failures
 *   - Adds targetAddressSpace: 'local' for private-network hosts (Chrome PNA)
 *   - While circuit is open, throws immediately (one probe per OPEN_MS allowed)
 *
 * Callers should still .catch — this never resolves on circuit-open.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : apiUrl(path);
  const now = Date.now();

  // Circuit open: allow exactly one probe per OPEN_MS; reject the rest.
  if (!healthSnapshot.healthy && now < healthSnapshot.openUntil) {
    throw new Error("circuit_open");
  }

  // Chrome PNA: opt the request into the local-network address space when the
  // active host is private. Older Chromes ignore the option; newer ones use it
  // to drive the permission prompt instead of a hard block.
  const finalInit: RequestInit & { targetAddressSpace?: "loopback" | "local" | "private" } = { ...init };
  if (isPrivateHost()) {
    const r = resolveHost();
    const h = r?.host.split(":")[0].toLowerCase() ?? "";
    finalInit.targetAddressSpace =
      h === "localhost" || h === "127.0.0.1" ? "loopback" : "local";
  }

  try {
    const res = await fetch(url, finalInit);
    // 5xx is still a "real" failure for breaker purposes; 4xx is not.
    if (res.status >= 500) throw new Error(`http_${res.status}`);
    // Success → reset.
    if (!healthSnapshot.healthy || healthSnapshot.consecutiveFails > 0) {
      commit({ healthy: true, consecutiveFails: 0, openUntil: 0, lastError: null });
    }
    return res;
  } catch (err) {
    const fails = healthSnapshot.consecutiveFails + 1;
    const msg = err instanceof Error ? err.message : String(err);
    if (fails >= FAIL_THRESHOLD) {
      commit({ healthy: false, consecutiveFails: fails, openUntil: now + OPEN_MS, lastError: msg });
    } else {
      commit({ consecutiveFails: fails, lastError: msg });
    }
    throw err;
  }
}

/** Convenience: apiFetch + .json(), returns null on any failure. */
export async function apiFetchJson<T = any>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await apiFetch(path, init);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

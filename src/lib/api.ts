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

/** Pure trust boundary for every backend origin used by operator auth. */
export function canonicalizeBackendOrigin(
  input: string,
  pageProtocol: string,
): { exactOrigin: string; mixedContent: boolean } {
  const value = input.trim();
  if (!value || value.startsWith("//") || /[@?#]/.test(value) || !/^(?:https?:\/\/)?[^/\\]+\/?$/i.test(value)) throw new Error("invalid_backend_origin");
  const hasScheme = /^https?:\/\//i.test(value);
  const schemeLike = /^[a-z][a-z\d+.-]*:/i.test(value);
  if (schemeLike && !hasScheme && !/^[^/?#]+:\d+\/?$/.test(value)) throw new Error("invalid_backend_origin");
  let url: URL;
  try { url = new URL(hasScheme ? value : `https://${value}`); }
  catch { throw new Error("invalid_backend_origin"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("invalid_backend_origin");
  }
  return {
    exactOrigin: url.origin,
    mixedContent: pageProtocol === "https:" && url.protocol === "http:",
  };
}

const pageLocation = () => typeof window === "undefined" ? null : window.location;
const storage = () => typeof localStorage === "undefined" ? null : localStorage;
const params = new URLSearchParams(pageLocation()?.search ?? "");
const urlHost = params.get("host");

// Auto-persist: ?host= in URL → save to localStorage → redirect clean
if (urlHost) {
  canonicalizeBackendOrigin(urlHost, pageLocation()?.protocol ?? "http:");
  storage()?.setItem(STORAGE_KEY, urlHost);
  addRecentHost(urlHost);
  const url = new URL(pageLocation()!.href);
  url.searchParams.delete("host");
  window.location.replace(url.toString());
}

let hostParam = storage()?.getItem(STORAGE_KEY) ?? null;

function activeBackendOrigin(): string | null {
  const input = hostParam ?? pageLocation()?.origin ?? "http://localhost";
  try { return canonicalizeBackendOrigin(input, pageLocation()?.protocol ?? "http:").exactOrigin; }
  catch { return null; }
}

type OperatorCredential = { exactOrigin: string; token: string; generation: number };
export type OperatorAuthOutcome = "authenticated" | "unauthorized" | "forbidden" | "unavailable"
  | "invalid_response" | "aborted" | "stale";

let operatorCredential: OperatorCredential | null = null;
let operatorGeneration = 0;
const operatorListeners = new Set<() => void>();

function candidateHeaders(token: string): Headers | null {
  const bytes = new TextEncoder().encode(token).byteLength;
  if (!token.trim() || bytes > 4096) return null;
  try {
    const headers = new Headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
    return headers.get("Authorization") === `Bearer ${token}` ? headers : null;
  } catch { return null; }
}

function invalidateOperatorCredential(expected?: OperatorCredential): void {
  if (expected && operatorCredential !== expected) return;
  operatorGeneration++;
  if (!operatorCredential) return;
  operatorCredential = null;
  operatorListeners.forEach(listener => listener());
}

export function clearOperatorCredential(): void { invalidateOperatorCredential(); }
export function hasOperatorCredential(): boolean { return operatorCredential !== null; }
export function subscribeOperatorCredential(listener: () => void): () => void {
  operatorListeners.add(listener);
  return () => { operatorListeners.delete(listener); };
}

export async function authenticateOperator(token: string, signal?: AbortSignal): Promise<OperatorAuthOutcome> {
  invalidateOperatorCredential();
  const generation = operatorGeneration;
  const exactOrigin = activeBackendOrigin();
  const headers = candidateHeaders(token);
  const current = () => generation === operatorGeneration && activeBackendOrigin() === exactOrigin;
  if (!exactOrigin || !headers) return "invalid_response";
  if (canonicalizeBackendOrigin(exactOrigin, pageLocation()?.protocol ?? "http:").mixedContent) return "invalid_response";
  const init: RequestInit & { targetAddressSpace?: "loopback" | "local" } = {
    method: "POST", headers, body: '{"path":"/ws"}', credentials: "omit", redirect: "error",
    cache: "no-store", signal,
  };
  if (isPrivateHost()) init.targetAddressSpace = new URL(exactOrigin).hostname.toLowerCase() === "localhost"
    || new URL(exactOrigin).hostname === "127.0.0.1" ? "loopback" : "local";
  let response: Response;
  try { response = await fetch(`${exactOrigin}/api/auth/ws-ticket`, init); }
  catch (error) {
    if (!current()) return "stale";
    return signal?.aborted || (error && typeof error === "object" && "name" in error && error.name === "AbortError")
      ? "aborted" : "unavailable";
  }
  if (!current()) return "stale";
  if (response.status === 401) return "unauthorized";
  if (response.status === 403) return "forbidden";
  if (response.status >= 500) return "unavailable";
  const jsonType = /^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? "");
  const noStore = (response.headers.get("Cache-Control") ?? "").split(",")
    .some(directive => directive.trim().toLowerCase() === "no-store");
  if (response.status !== 200 || !jsonType || !noStore) return "invalid_response";
  let proof: unknown;
  try { proof = await response.json(); }
  catch { return current() ? "invalid_response" : "stale"; }
  if (!current()) return "stale";
  if (!proof || typeof proof !== "object" || Array.isArray(proof)
      || Object.keys(proof).sort().join() !== "protocol,ticket") return "invalid_response";
  const value = proof as { protocol?: unknown; ticket?: unknown };
  if (value.protocol !== "maw.ws.v1" || typeof value.ticket !== "string"
      || !/^mwt1_[0-9a-f]{64}$/.test(value.ticket)) return "invalid_response";
  operatorCredential = { exactOrigin, token, generation };
  operatorListeners.forEach(listener => listener());
  return "authenticated";
}

/** Whether we're running in remote mode */
export const isRemote = !!hostParam;

/** Where the active host came from (always "config" or "local" after redirect) */
export const hostSource: "config" | "local" =
  storage()?.getItem(STORAGE_KEY) ? "config" : "local";

/** Raw active host value (from URL or config) */
export const activeHost: string | null = hostParam;

/** Read stored host from config */
export function getStoredHost(): string | null {
  return storage()?.getItem(STORAGE_KEY) ?? null;
}

/** Save host to config + add to recent list */
export function setStoredHost(host: string): void {
  const next = canonicalizeBackendOrigin(host, pageLocation()?.protocol ?? "http:");
  clearOperatorCredential();
  hostParam = host;
  storage()?.setItem(STORAGE_KEY, host);
  addRecentHost(host);
}

/** Clear stored host (revert to local) */
export function clearStoredHost(): void {
  clearOperatorCredential();
  hostParam = null;
  storage()?.removeItem(STORAGE_KEY);
}

/** Get recent hosts list */
export function getRecentHosts(): string[] {
  try {
    return JSON.parse(storage()?.getItem(RECENT_KEY) || "[]");
  } catch { return []; }
}

function addRecentHost(host: string): void {
  const recent = getRecentHosts().filter(h => h !== host);
  recent.unshift(host);
  storage()?.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
}

/** Resolved {protocol, host:port} from `hostParam`, or null if same-origin. */
function resolveHost(): { httpProto: string; wsProto: string; host: string } | null {
  if (!hostParam) return null;
  const origin = canonicalizeBackendOrigin(hostParam, pageLocation()?.protocol ?? "http:").exactOrigin;
  const url = new URL(origin);
  return { httpProto: url.protocol, wsProto: url.protocol === "https:" ? "wss:" : "ws:", host: url.host };
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
  if (!path.startsWith("/api/") || path.includes("\\")) throw new Error("invalid_api_path");
  const activeOrigin = activeBackendOrigin();
  if (!activeOrigin) throw new Error("invalid_backend_origin");
  const resolved = new URL(path, `${activeOrigin}/`);
  if (resolved.origin !== activeOrigin || !resolved.pathname.startsWith("/api/") || resolved.hash) {
    throw new Error("invalid_api_path");
  }
  let suppliedHeaders: Headers;
  try { suppliedHeaders = new Headers(init?.headers); }
  catch { throw new Error("invalid_request_headers"); }
  if (suppliedHeaders.has("Authorization") || suppliedHeaders.has("X-Maw-Token")) {
    throw new Error("caller_auth_forbidden");
  }
  const requestCredential = operatorCredential?.exactOrigin === resolved.origin ? operatorCredential : null;
  const requestToken = requestCredential?.token ?? null;
  if (requestToken) suppliedHeaders.set("Authorization", `Bearer ${requestToken}`);
  const url = resolved.toString();
  const now = Date.now();

  // Circuit open: allow exactly one probe per OPEN_MS; reject the rest.
  if (!healthSnapshot.healthy && now < healthSnapshot.openUntil) {
    throw new Error("circuit_open");
  }

  // Chrome PNA: opt the request into the local-network address space when the
  // active host is private. Older Chromes ignore the option; newer ones use it
  // to drive the permission prompt instead of a hard block.
  const finalInit: RequestInit & { targetAddressSpace?: "loopback" | "local" | "private" } = {
    ...init,
    headers: suppliedHeaders,
    credentials: "omit",
    redirect: "error",
  };
  if (isPrivateHost()) {
    const r = resolveHost();
    const h = r?.host.split(":")[0].toLowerCase() ?? "";
    finalInit.targetAddressSpace =
      h === "localhost" || h === "127.0.0.1" ? "loopback" : "local";
  }

  try {
    const res = await fetch(url, finalInit);
    if (res.status === 401 && requestCredential) invalidateOperatorCredential(requestCredential);
    // 5xx is still a "real" failure for breaker purposes; 4xx is not.
    if (res.status >= 500) throw new Error(`http_${res.status}`);
    // Success → reset.
    if (!healthSnapshot.healthy || healthSnapshot.consecutiveFails > 0) {
      commit({ healthy: true, consecutiveFails: 0, openUntil: 0, lastError: null });
    }
    return res;
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
      const safeAbort = new Error("request_aborted");
      safeAbort.name = "AbortError";
      throw safeAbort;
    }
    const fails = healthSnapshot.consecutiveFails + 1;
    const raw = err instanceof Error ? err.message : String(err);
    const msg = requestToken ? "api_fetch_failed" : raw;
    const safeError = requestToken ? new Error(msg) : err;
    if (fails >= FAIL_THRESHOLD) {
      commit({ healthy: false, consecutiveFails: fails, openUntil: now + OPEN_MS, lastError: msg });
    } else {
      commit({ consecutiveFails: fails, lastError: msg });
    }
    throw safeError;
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

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

const params = new URLSearchParams(window.location.search);
const hostParam = params.get("host");

/** Whether we're running in remote mode */
export const isRemote = !!hostParam;

/** Resolved {protocol, host:port} from `hostParam`, or null if same-origin. */
function resolveHost(): { httpProto: string; wsProto: string; host: string } | null {
  if (!hostParam) return null;
  if (hostParam.startsWith("https://")) {
    return { httpProto: "https:", wsProto: "wss:", host: hostParam.slice("https://".length) };
  }
  if (hostParam.startsWith("http://")) {
    return { httpProto: "http:", wsProto: "ws:", host: hostParam.slice("http://".length) };
  }
  // Bare host:port — default to https for backwards compatibility.
  return { httpProto: "https:", wsProto: "wss:", host: hostParam };
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

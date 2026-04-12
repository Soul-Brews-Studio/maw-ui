/**
 * PeerExecClient — browser-side client for POST /api/peer/exec.
 *
 * PROTOTYPE — iteration 3 of the federation-join-easy proof. See
 * `mawui-oracle/ψ/writing/federation-join-easy.md` for full context. Companion
 * to `maw-js/src/api/wormhole.ts` (the server half drafted in parallel on
 * maw-js's feat/wormhole-http-endpoint-draft branch).
 *
 * ## Why this client exists
 *
 * `src/lib/api.ts` implements the drizzle.studio `?host=` pattern and works
 * perfectly for HTTPS peers. But the "lazy-setup federation via global UI"
 * case hits three walls for HTTP-LAN / WireGuard-only peers:
 *
 *   1. Mixed-content rule blocks HTTPS origin → HTTP peer fetches
 *   2. WireGuard-only peers aren't reachable from the browser at all
 *   3. Browsers don't know `federationToken` and shouldn't
 *
 * The PeerExecClient bypasses all three by relaying through the local
 * maw-js backend. It's same-origin (no mixed content), the backend has
 * WG routes (peer reachability), and the backend signs with HMAC (no
 * secret in the browser).
 *
 * ## Signature shape
 *
 * Anonymous browser visitors carry `[<host>:anon-<nonce>]`. The backend's
 * trust boundary treats any `anon-*` origin as permanently read-only —
 * it's never on `config.wormhole.shellPeers`. This means a drive-by visitor
 * to the hosted UI can run `/dig`, `/trace`, `/recap`, `/standup`, and other
 * readonly commands against any peer, but can never mutate state on a
 * federation they don't own.
 *
 * ## Usage
 *
 * ```ts
 * import { PeerExecClient } from "./peerExecClient";
 *
 * const hostParam = new URLSearchParams(location.search).get("host");
 * const pe = new PeerExecClient(hostParam ?? "localhost");
 * await pe.ensureSession(); // once, on page load
 *
 * const result = await pe.request("/dig", ["--all", "5"]);
 * console.log(result.output);
 * ```
 *
 * ## Coexistence with apiUrl()
 *
 * `src/lib/api.ts`'s `apiUrl()` helper is NOT replaced by this client. The
 * two coexist:
 *
 *   - `apiUrl()` = direct-fetch path, works for HTTPS peers, no backend relay
 *   - `PeerExecClient` = relay path, needed for HTTP-LAN / WG-only peers
 *
 * The UI can pick at runtime based on the `?host=` form: if the resolved
 * peer URL is HTTPS, use `apiUrl()`; if it's HTTP or a bare peer name, use
 * `PeerExecClient`. Iteration 4 will add a tiny dispatcher helper for this.
 *
 * ## Status
 *
 * - **Iteration 3 prototype** — drafted on `feat/wormhole-client-draft` branch,
 *   NOT merged to main, NOT part of a PR yet.
 * - No call-site migration in this iteration — just the client class.
 * - Awaits server half in maw-js + Nat's confirmation on deploy ownership.
 */

// --- Types ---------------------------------------------------------------

export interface PeerExecResponse {
  /** The peer's raw response body */
  output: string;
  /** Which peer URL served the response */
  from: string;
  /** Round-trip time including backend relay + peer execution */
  elapsed_ms: number;
  /** Upstream HTTP status from the peer */
  status: number;
  /** Trust tier the backend applied: "readonly" or "shell_allowlisted" */
  trust_tier: "readonly" | "shell_allowlisted";
}

export interface PeerExecError {
  error: string;
  [key: string]: unknown;
}

// --- Signature generation ------------------------------------------------

/**
 * Generate an anonymous signature for a browser visitor. Uses crypto.randomUUID()
 * if available (modern browsers), else falls back to Math.random.
 *
 * The nonce is 8 hex chars — enough for uniqueness within a session but not
 * so long that logs become unreadable.
 */
export function generateAnonSignature(originHost: string): string {
  let nonce: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  } else {
    nonce = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  }
  return `[${originHost}:anon-${nonce}]`;
}

// --- Client --------------------------------------------------------------

export class PeerExecClient {
  readonly peer: string;
  readonly signature: string;
  private sessionReady = false;

  constructor(peer: string, originHost?: string) {
    this.peer = peer;
    // Default origin: the current window's host (hostname + optional :port).
    // Guards for SSR / test environments where `window` is undefined.
    const host =
      originHost ??
      (typeof window !== "undefined" ? window.location.host : "unknown-origin");
    this.signature = generateAnonSignature(host);
  }

  /**
   * Fetch the peer-exec session cookie. MUST be called once before any
   * `request()` calls in production. Safe to call multiple times — the
   * backend re-issues the same cookie on each GET.
   *
   * Idempotent: subsequent calls short-circuit after the first success.
   */
  async ensureSession(): Promise<void> {
    if (this.sessionReady) return;
    const res = await fetch("/api/peer/session", {
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error(
        `peerExec: session bootstrap failed (${res.status} ${res.statusText})`,
      );
    }
    this.sessionReady = true;
  }

  /**
   * Relay a command to the configured peer. Readonly commands
   * (/dig, /trace, /recap, /standup, /who-are-you, /philosophy,
   * /where-we-are) work for anonymous visitors; other commands will 403
   * unless the backend has this origin in config.wormhole.shellPeers.
   */
  async request(cmd: string, args: string[] = []): Promise<PeerExecResponse> {
    if (!this.sessionReady) {
      // Auto-bootstrap — easier for callers who forget.
      await this.ensureSession();
    }

    const res = await fetch("/api/peer/exec", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peer: this.peer,
        cmd,
        args,
        signature: this.signature,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as PeerExecError;
      const err = new Error(
        `peerExec: ${res.status} ${body.error ?? res.statusText} (peer=${this.peer}, cmd=${cmd})`,
      );
      (err as any).status = res.status;
      (err as any).body = body;
      throw err;
    }

    return (await res.json()) as PeerExecResponse;
  }

  /**
   * Convenience: is this cmd safe to run anonymously? Mirrors the backend
   * trust boundary. Useful for UI gating — disable a button before the
   * backend would 403.
   */
  static isReadOnlyCmd(cmd: string): boolean {
    const READONLY = [
      "/dig",
      "/trace",
      "/recap",
      "/standup",
      "/who-are-you",
      "/philosophy",
      "/where-we-are",
    ];
    const trimmed = cmd.trim();
    return READONLY.some((prefix) => trimmed === prefix || trimmed.startsWith(prefix + " "));
  }
}

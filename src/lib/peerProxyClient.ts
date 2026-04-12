/**
 * PeerProxyClient — browser-side client for `POST /api/proxy`.
 *
 * PROTOTYPE — iteration 7 of the federation-join-easy /loop. Drafted on the
 * `feat/wormhole-client-draft` branch (alongside `PeerExecClient` and
 * `peerConnection`). See
 * `mawui-oracle/ψ/writing/federation-join-easy.md` for full context.
 *
 * ## Companion to /api/proxy (NOT /api/wormhole)
 *
 * This client pairs with `maw-js/src/api/proxy.ts` (server-side, drafted on
 * `feat/api-proxy-http-peers`). It is a SEPARATE client from
 * `peerExecClient.ts` because it serves a different need:
 *
 *   - **`PeerExecClient`** — signed command execution (`/dig`, `/trace`,
 *     `/recap`). RPC-shaped. Returns command output strings.
 *   - **`PeerProxyClient`** — generic HTTP REST relay. Returns full HTTP
 *     responses (status, headers, body). Used when an HTTPS origin needs
 *     to read REST data from an HTTP-LAN peer (the mixed-content-blocked
 *     case named by `peerConnection.ts`).
 *
 * Conflating them was the iteration-5 grounding catch. Keeping them as
 * separate clients with separate session cookies and separate trust models
 * is the iteration-6 architectural commitment.
 *
 * ## Trust model match-up with the server
 *
 * The server enforces:
 *   - GET / HEAD / OPTIONS: always permitted (HTTP read-only semantics)
 *   - POST / PUT / PATCH / DELETE: require origin in `config.proxy.shellPeers`
 *   - anon-* never on the allowlist by convention
 *
 * The client mirrors this with `PeerProxyClient.isReadOnlyMethod()` for UI
 * gating — disable a "save" button before the user submits and gets a 403
 * round-trip.
 *
 * ## Path allowlist (server-side defense in depth)
 *
 * Even GET requests are restricted to a fixed allowlist of v1 REST
 * endpoints. The client does NOT enforce this — the server is authoritative,
 * and the client should not duplicate the list (it would drift). Callers
 * that hit a non-allowlisted path get `403 path_not_proxyable` from the
 * server, which the client surfaces as a typed error.
 *
 * ## Status
 *
 * - Iteration 7 prototype, on `feat/wormhole-client-draft` (the maw-ui
 *   federation bundle branch). PR-time decision: split into separate PRs
 *   for peerConnection / PeerExecClient / PeerProxyClient, or ship as one.
 * - Companion server endpoint `POST /api/proxy` lives on the SEPARATE
 *   `feat/api-proxy-http-peers` branch on maw-js. Both will be filed
 *   together when Q#5 (deploy ownership) is answered.
 */

// ---- Types ---------------------------------------------------------------

export type ProxyMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface PeerProxyResponse {
  /** Upstream HTTP status code from the peer */
  status: number;
  /** Subset of safe response headers (content-type, cache-control, etag, last-modified) */
  headers: Record<string, string>;
  /** Raw response body as a string */
  body: string;
  /** Which peer URL served the response */
  from: string;
  /** Round-trip time including local backend relay + peer execution */
  elapsed_ms: number;
  /** Trust tier the backend applied: "readonly_method" or "shell_allowlisted" */
  trust_tier: "readonly_method" | "shell_allowlisted";
}

export interface PeerProxyError {
  error: string;
  [key: string]: unknown;
}

// ---- Signature generation ------------------------------------------------

/**
 * Generate an anonymous signature for a browser visitor. Same shape as
 * `generateAnonSignature` in `peerExecClient.ts` — duplicated here to avoid
 * cross-file coupling between two prototype clients. If we ever share this,
 * it moves to `src/lib/signature.ts` with explicit dual-consumer tests.
 */
export function generateProxyAnonSignature(originHost: string): string {
  let nonce: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  } else {
    nonce = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  }
  return `[${originHost}:anon-${nonce}]`;
}

// ---- Client --------------------------------------------------------------

export class PeerProxyClient {
  readonly peer: string;
  readonly signature: string;
  private sessionReady = false;

  constructor(peer: string, originHost?: string) {
    this.peer = peer;
    const host =
      originHost ??
      (typeof window !== "undefined" ? window.location.host : "unknown-origin");
    this.signature = generateProxyAnonSignature(host);
  }

  /**
   * Bootstrap the proxy session cookie. Must be called once before any
   * `request()` / `get()` / `post()` calls in production. Idempotent —
   * safe to call multiple times.
   */
  async ensureSession(): Promise<void> {
    if (this.sessionReady) return;
    const res = await fetch("/api/proxy/session", {
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error(
        `peerProxy: session bootstrap failed (${res.status} ${res.statusText})`,
      );
    }
    this.sessionReady = true;
  }

  /**
   * Generic request method. Auto-bootstraps the session if the caller
   * forgets. Returns a typed `PeerProxyResponse` on success; throws on
   * non-2xx with `.status` and `.body` attached.
   */
  async request(
    method: ProxyMethod,
    path: string,
    body?: string,
  ): Promise<PeerProxyResponse> {
    if (!this.sessionReady) {
      await this.ensureSession();
    }

    const res = await fetch("/api/proxy", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peer: this.peer,
        method,
        path,
        body,
        signature: this.signature,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as PeerProxyError;
      const err = new Error(
        `peerProxy: ${res.status} ${errBody.error ?? res.statusText} (peer=${this.peer}, ${method} ${path})`,
      );
      (err as any).status = res.status;
      (err as any).body = errBody;
      throw err;
    }

    return (await res.json()) as PeerProxyResponse;
  }

  // --- HTTP method shortcuts ---

  get(path: string): Promise<PeerProxyResponse> {
    return this.request("GET", path);
  }

  head(path: string): Promise<PeerProxyResponse> {
    return this.request("HEAD", path);
  }

  options(path: string): Promise<PeerProxyResponse> {
    return this.request("OPTIONS", path);
  }

  post(path: string, body?: string): Promise<PeerProxyResponse> {
    return this.request("POST", path, body);
  }

  put(path: string, body?: string): Promise<PeerProxyResponse> {
    return this.request("PUT", path, body);
  }

  patch(path: string, body?: string): Promise<PeerProxyResponse> {
    return this.request("PATCH", path, body);
  }

  delete(path: string): Promise<PeerProxyResponse> {
    return this.request("DELETE", path);
  }

  // --- Static helpers ---

  /**
   * Mirrors the server-side trust boundary: GET / HEAD / OPTIONS are
   * permitted for anonymous browser visitors; mutations require the
   * origin to be on `config.proxy.shellPeers`. UI code should disable
   * mutation buttons for anon visitors before they hit a 403.
   */
  static isReadOnlyMethod(method: string): boolean {
    const m = method.toUpperCase();
    return m === "GET" || m === "HEAD" || m === "OPTIONS";
  }

  /**
   * Convenience helper: parse a `PeerProxyResponse.body` as JSON. Returns
   * the parsed object or throws if the body is malformed. Useful for
   * REST endpoints that return JSON (the v1 path allowlist is mostly JSON).
   */
  static parseJsonBody<T = unknown>(response: PeerProxyResponse): T {
    try {
      return JSON.parse(response.body) as T;
    } catch (err: any) {
      throw new Error(
        `peerProxy: failed to parse response body as JSON (${err?.message ?? "unknown error"})`,
      );
    }
  }
}

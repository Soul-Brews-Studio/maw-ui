/**
 * resolvePeerConnection — classify how a caller can reach a peer via the
 * browser's fetch primitive, given the `?host=` form and the current origin.
 *
 * PROTOTYPE — iteration 5 of the federation-join-easy /loop. Drafted on the
 * feat/wormhole-client-draft branch. See
 * mawui-oracle/ψ/writing/federation-join-easy.md for the full context and
 * the iteration-5 architectural refinement.
 *
 * ## The shape confusion this helper closes
 *
 * Iterations 1-4 framed a "runtime dispatcher" that would pick between
 * `apiUrl()` (direct fetch) and `WormholeClient` (relay) based on peer shape.
 * **That framing was wrong** — the two primitives serve DIFFERENT needs:
 *
 *   - `apiUrl()` is for **REST data fetching** — `/api/config`, `/api/feed`,
 *     `/api/sessions`, etc. Arbitrary HTTP GET/POST against a peer's API.
 *   - `WormholeClient` is for **signed command execution** — `/dig`,
 *     `/trace`, `/recap`. RPC-shaped, readonly-or-allowlisted, returns a
 *     command output string.
 *
 * The wormhole protocol does NOT generalize to arbitrary REST relay —
 * that would require a different endpoint shape (`POST /api/proxy/...`
 * wrapping an HTTP request/response). Conflating them was an error caught
 * in iteration 5 grounding.
 *
 * ## What this helper actually does
 *
 * It classifies a `?host=` value into one of four `PeerConnection` kinds
 * and hands the caller back enough information to do the right thing OR
 * show a clear error. It does NOT wrap `fetch`. It does NOT hide failure
 * modes. The mixed-content-blocked case is surfaced as a dedicated kind,
 * not silently broken.
 *
 * ## Mixed-content rule (the real browser-side blocker)
 *
 * `src/server.ts:40` in maw-js already has permissive CORS + Private
 * Network Access header. CORS is NOT the blocker for direct browser →
 * LAN-peer fetches. The real blocker is the browser's mixed-content rule:
 *
 *   origin = https://...   →   peer = http://...   →   BLOCKED (active content)
 *   origin = http://...    →   peer = http://...   →   OK
 *   origin = https://...   →   peer = https://...  →   OK
 *   origin = http://...    →   peer = https://...  →   OK (mixed OK upgraded)
 *
 * When mixed-content blocks a direct fetch, the caller has three options:
 *
 *   1. **Run maw-ui locally** (the "pro path") — serve the lens from
 *      http://localhost:5173 or via `maw ui --from-ci`. Same-origin
 *      fetches work natively, no wormhole needed.
 *   2. **Use a future `POST /api/proxy/*` endpoint** — not yet built.
 *      This is iteration 5+ scope. It would be a generic HTTP proxy
 *      through the local backend for arbitrary REST calls to HTTP-LAN
 *      peers.
 *   3. **Use `/wormhole`** — but only for command execution, not for
 *      REST fetches. If the caller wants `/dig` output, wormhole works;
 *      if they want `/api/sessions`, wormhole doesn't help.
 *
 * This helper surfaces option 1 + 2 + 3 as an explicit error with a hint.
 * It does NOT paper over the limitation.
 */

// ---- Types ---------------------------------------------------------------

export type PeerConnection =
  | {
      /**
       * No `?host=` param — fetch against the same origin that served the
       * HTML. `apiUrl(path)` returns the path as-is.
       */
      kind: "same-origin";
    }
  | {
      /**
       * Cross-origin fetch is possible — either HTTPS peer from any origin,
       * HTTP peer from HTTP origin, or bare `host:port` (defaults to HTTPS).
       * `apiUrl(path)` returns the absolute URL; `fetch()` succeeds.
       */
      kind: "direct";
      protocol: "http" | "https";
      baseUrl: string;
    }
  | {
      /**
       * HTTPS origin trying to reach an HTTP peer — browser blocks via
       * mixed-content rule. Caller MUST use one of:
       *   - Run maw-ui locally (same-origin to a local backend)
       *   - Future `POST /api/proxy/*` endpoint (not yet built)
       *   - `/wormhole` for command execution (NOT for REST reads)
       */
      kind: "mixed-content-blocked";
      peerUrl: string;
      hint: string;
    }
  | {
      /**
       * The `?host=` value could not be parsed as any known shape.
       */
      kind: "invalid";
      reason: string;
      input: string;
    };

// ---- Helpers -------------------------------------------------------------

/**
 * Detect the current page's protocol. Defaults to "https:" in test/SSR
 * environments where `location` is undefined — the conservative default
 * because it produces more mixed-content-blocked classifications, which
 * surfaces the real-world problem rather than hiding it.
 */
function currentProtocol(): "http:" | "https:" {
  if (typeof location === "undefined") return "https:";
  return location.protocol === "http:" ? "http:" : "https:";
}

/**
 * Parse a `?host=` value into its protocol + host parts. Accepts three
 * forms (matching `src/lib/api.ts:resolveHost` semantics):
 *
 *   - Bare `host:port` — defaults to https
 *   - Full `http://host[:port]`
 *   - Full `https://host[:port]`
 *
 * Returns null if the input is malformed.
 */
function parseHostParam(
  hostParam: string,
): { protocol: "http" | "https"; host: string } | null {
  const trimmed = hostParam.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("https://")) {
    return { protocol: "https", host: trimmed.slice("https://".length) };
  }
  if (trimmed.startsWith("http://")) {
    return { protocol: "http", host: trimmed.slice("http://".length) };
  }

  // Bare form — must look like `host[:port]`, defaults to https
  // Accept hostnames with letters, digits, dots, dashes, and an optional :port
  if (/^[a-zA-Z0-9][a-zA-Z0-9.\-]*(?::\d+)?$/.test(trimmed)) {
    return { protocol: "https", host: trimmed };
  }

  return null;
}

// ---- Main helper ---------------------------------------------------------

/**
 * Classify how a caller can reach a peer. Given a `?host=` value (typically
 * `new URLSearchParams(location.search).get("host")`) and an optional
 * explicit origin protocol (for testing / SSR), return a discriminated
 * union describing the connection shape.
 *
 * Callers match on `.kind` and do the right thing:
 *
 *   const pc = resolvePeerConnection(new URLSearchParams(location.search).get("host"));
 *   switch (pc.kind) {
 *     case "same-origin":
 *     case "direct":
 *       // Use apiUrl() + fetch — works
 *       break;
 *     case "mixed-content-blocked":
 *       // Show error banner: "HTTPS origin can't reach HTTP peer directly"
 *       // Offer: run locally, wait for proxy endpoint, or use /wormhole for cmds
 *       break;
 *     case "invalid":
 *       // Show error: malformed ?host= value
 *       break;
 *   }
 */
export function resolvePeerConnection(
  hostParam: string | null | undefined,
  originProtocol: "http:" | "https:" = currentProtocol(),
): PeerConnection {
  if (!hostParam || hostParam.trim() === "") {
    return { kind: "same-origin" };
  }

  const parsed = parseHostParam(hostParam);
  if (!parsed) {
    return {
      kind: "invalid",
      reason: "unrecognized host shape — expected `host:port`, `http://...`, or `https://...`",
      input: hostParam,
    };
  }

  const peerUrl = `${parsed.protocol}://${parsed.host}`;

  // Mixed-content rule: HTTPS origin trying to reach HTTP peer is blocked
  // by every modern browser. Active-content mixed requests are NEVER
  // auto-upgraded; the fetch will fail with an opaque error.
  if (originProtocol === "https:" && parsed.protocol === "http") {
    return {
      kind: "mixed-content-blocked",
      peerUrl,
      hint:
        "Browser mixed-content rule blocks HTTPS → HTTP fetches. " +
        "Options: (a) run `maw ui --from-ci` locally and use same-origin; " +
        "(b) wait for POST /api/proxy/* generic relay endpoint (iteration 5+); " +
        "(c) use /wormhole for signed COMMAND execution (not REST reads).",
    };
  }

  return {
    kind: "direct",
    protocol: parsed.protocol,
    baseUrl: peerUrl,
  };
}

// ---- Convenience helpers -------------------------------------------------

/**
 * Shortcut: can the browser fetch REST data from this peer directly?
 * Returns `true` for `same-origin` and `direct`; `false` for
 * `mixed-content-blocked` and `invalid`.
 *
 * Useful for gating UI elements that depend on arbitrary REST reads.
 * For command execution, use `WormholeClient` instead regardless of
 * this helper's result.
 */
export function canFetchDirectly(
  hostParam: string | null | undefined,
  originProtocol?: "http:" | "https:",
): boolean {
  const pc = resolvePeerConnection(hostParam, originProtocol);
  return pc.kind === "same-origin" || pc.kind === "direct";
}

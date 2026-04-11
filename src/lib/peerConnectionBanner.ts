/**
 * peerConnectionBanner — derive user-facing banner content from a
 * `PeerConnection` classification, so the UI can render a clear error
 * message instead of letting the user stare at a mysterious fetch failure.
 *
 * PROTOTYPE — iteration 8 of the federation-join-easy /loop. Drafted on the
 * `feat/wormhole-client-draft` branch alongside the rest of the maw-ui
 * federation bundle. See
 * `mawui-oracle/ψ/writing/federation-join-easy.md` for context.
 *
 * ## Why this is a pure helper instead of a React component
 *
 * The component layer is a 5-line wrapper around this helper:
 *
 *   ```tsx
 *   const banner = getPeerConnectionBanner(pc);
 *   if (!banner) return null;
 *   return <Banner severity={banner.severity} title={banner.title}>...</Banner>;
 *   ```
 *
 * Keeping the logic in a pure helper means:
 *   - Zero DOM dependency for testing (bun test works natively)
 *   - The classifier output can be unit-tested independently of any UI library
 *   - A future migration from React to anything else doesn't touch this file
 *   - The helper can be reused by non-banner UI (toasts, tooltips, modal dialogs)
 *
 * The actual `peerConnectionBanner.tsx` React component is deferred to
 * iteration 9+ — when there's a real call site that needs it. YAGNI until
 * a caller exists.
 *
 * ## What gets a banner
 *
 * | PeerConnection.kind        | Banner? | Severity |
 * |---                          |---      |---       |
 * | `same-origin`               | no      | (n/a)    |
 * | `direct`                    | no      | (n/a)    |
 * | `mixed-content-blocked`     | YES     | error    |
 * | `invalid`                   | YES     | warning  |
 *
 * The `same-origin` and `direct` cases are happy paths — the caller can
 * fetch normally and there's nothing to surface.
 *
 * The `mixed-content-blocked` case is the load-bearing one. Without this
 * banner, the user clicks a federation link and watches the page fail to
 * load with no explanation. With the banner, they see exactly why and
 * what to do.
 *
 * The `invalid` case is a malformed `?host=` value — the user (or whoever
 * generated the link) made a typo. Surfaced as a warning, not an error,
 * because the page still works in the same-origin sense.
 */

import type { PeerConnection } from "./peerConnection";

// ---- Types ---------------------------------------------------------------

export type BannerSeverity = "error" | "warning" | "info";

export interface BannerAction {
  /** Action label, e.g. "Run locally" */
  label: string;
  /** Free-form one-line description of what this action does */
  description: string;
  /** Optional href if the action is a link (e.g. to docs); UI may render as button otherwise */
  href?: string;
}

export interface PeerConnectionBanner {
  severity: BannerSeverity;
  title: string;
  message: string;
  /** Optional concrete actions the user can take to fix or work around the situation */
  actions: BannerAction[];
  /** The original `PeerConnection` for advanced consumers */
  source: PeerConnection;
}

// ---- The helper ----------------------------------------------------------

/**
 * Derive banner content from a `PeerConnection` classification.
 *
 * Returns `null` for happy-path kinds (`same-origin`, `direct`) — the
 * caller renders nothing. Returns a populated `PeerConnectionBanner` for
 * `mixed-content-blocked` and `invalid` — the caller renders an error/
 * warning UI.
 */
export function getPeerConnectionBanner(pc: PeerConnection): PeerConnectionBanner | null {
  switch (pc.kind) {
    case "same-origin":
    case "direct":
      // Happy paths — nothing to surface
      return null;

    case "mixed-content-blocked":
      return {
        severity: "error",
        title: "Cannot reach this peer from a secure origin",
        message:
          `The browser blocks HTTPS pages from fetching plain HTTP resources. ` +
          `This page is loaded over HTTPS, but the peer at ${pc.peerUrl} only ` +
          `accepts HTTP — so direct fetches are blocked at the protocol level ` +
          `(this isn't a CORS issue and can't be fixed with a header).`,
        actions: [
          {
            label: "Run maw-ui locally",
            description:
              "Use `maw ui --from-ci` to serve the lens from http://localhost. " +
              "Same-origin fetches to your local backend work without browser blocks.",
          },
          {
            label: "Use the proxy endpoint",
            description:
              "POST /api/proxy on your local backend relays REST calls to HTTP peers. " +
              "Works for the v1 read-only endpoints (config, feed, sessions, teams, etc.).",
          },
          {
            label: "Use /wormhole for commands",
            description:
              "POST /api/wormhole/request on your local backend relays signed commands " +
              "(/dig, /trace, /recap) to any peer. NOT for arbitrary REST reads.",
          },
        ],
        source: pc,
      };

    case "invalid":
      return {
        severity: "warning",
        title: "Malformed `?host=` value",
        message:
          `The host parameter "${pc.input}" couldn't be parsed. ` +
          `Expected one of: \`host:port\`, \`http://host\`, or \`https://host\`. ` +
          `Reason: ${pc.reason}.`,
        actions: [
          {
            label: "Remove the host parameter",
            description:
              "Loading the page without `?host=` falls back to the same-origin backend, " +
              "which works as long as your local maw-js is running.",
          },
          {
            label: "Fix the URL",
            description:
              "Try `?host=oracle-world` (named peer), `?host=10.20.0.7:3456` (LAN), " +
              "or `?host=https://white.local:3456` (explicit protocol).",
          },
        ],
        source: pc,
      };

    default: {
      // Exhaustiveness check — if a new kind is added to PeerConnection,
      // TypeScript will complain here and force a deliberate update.
      const _exhaustive: never = pc;
      void _exhaustive;
      return null;
    }
  }
}

// ---- Convenience helpers -------------------------------------------------

/**
 * Should the UI render any banner for this peer? Convenience wrapper for
 * conditional rendering: `{shouldShowBanner(pc) && <Banner ... />}`.
 */
export function shouldShowBanner(pc: PeerConnection): boolean {
  return getPeerConnectionBanner(pc) !== null;
}

/**
 * Pull just the severity for cases where the UI needs it before computing
 * the full banner content (e.g. setting an icon color).
 */
export function bannerSeverity(pc: PeerConnection): BannerSeverity | null {
  const banner = getPeerConnectionBanner(pc);
  return banner ? banner.severity : null;
}

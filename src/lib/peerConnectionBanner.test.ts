/**
 * Tests for peerConnectionBanner — pure helper that derives banner content
 * from a PeerConnection classification.
 *
 * PROTOTYPE — iteration 8 of the federation-join-easy /loop. See
 * mawui-oracle/ψ/writing/federation-join-easy.md for context.
 *
 * Tests are pure — no React, no DOM, no rendering. The component layer
 * (a 5-line wrapper) is deferred until a real call site needs it.
 */

import { describe, test, expect } from "bun:test";
import {
  getPeerConnectionBanner,
  shouldShowBanner,
  bannerSeverity,
} from "./peerConnectionBanner";
import type { PeerConnection } from "./peerConnection";

// ---- Fixtures ------------------------------------------------------------

const sameOrigin: PeerConnection = { kind: "same-origin" };

const direct: PeerConnection = {
  kind: "direct",
  protocol: "https",
  baseUrl: "https://white.local:3456",
};

const mixedContentBlocked: PeerConnection = {
  kind: "mixed-content-blocked",
  peerUrl: "http://10.20.0.7:3456",
  hint: "Browser mixed-content rule blocks HTTPS → HTTP fetches.",
};

const invalid: PeerConnection = {
  kind: "invalid",
  reason: "unrecognized host shape",
  input: "garbage!!!",
};

// ---- getPeerConnectionBanner — happy-path returns null ------------------

describe("getPeerConnectionBanner — happy paths return null", () => {
  test("same-origin → null", () => {
    expect(getPeerConnectionBanner(sameOrigin)).toBeNull();
  });

  test("direct → null", () => {
    expect(getPeerConnectionBanner(direct)).toBeNull();
  });
});

// ---- getPeerConnectionBanner — mixed-content-blocked --------------------

describe("getPeerConnectionBanner — mixed-content-blocked", () => {
  test("returns error severity", () => {
    const banner = getPeerConnectionBanner(mixedContentBlocked);
    expect(banner).not.toBeNull();
    expect(banner!.severity).toBe("error");
  });

  test("title names the problem clearly (no jargon)", () => {
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    expect(banner.title.toLowerCase()).toContain("cannot reach");
  });

  test("message includes the actual peer URL", () => {
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    expect(banner.message).toContain("http://10.20.0.7:3456");
  });

  test("message explicitly says it's NOT a CORS issue", () => {
    // Load-bearing: users will think CORS first. The banner must rule
    // it out so they don't waste time chasing the wrong fix.
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    const lower = banner.message.toLowerCase();
    expect(lower).toContain("cors");
    // Accept "isn't a cors", "is not a cors", "not a cors" — any negation form.
    const negatesCors =
      lower.includes("isn't a cors") ||
      lower.includes("is not a cors") ||
      lower.includes("not a cors");
    expect(negatesCors).toBe(true);
  });

  test("provides three concrete actions", () => {
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    expect(banner.actions.length).toBe(3);
  });

  test("actions cover: run locally, proxy endpoint, wormhole", () => {
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    const labels = banner.actions.map((a) => a.label.toLowerCase());
    expect(labels.some((l) => l.includes("locally"))).toBe(true);
    expect(labels.some((l) => l.includes("proxy"))).toBe(true);
    expect(labels.some((l) => l.includes("wormhole"))).toBe(true);
  });

  test("wormhole action is explicit about commands-not-REST scope", () => {
    // Load-bearing: this is the iteration-5 grounding catch encoded in UX.
    // The user must NOT think wormhole is a REST proxy.
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    const wormholeAction = banner.actions.find((a) =>
      a.label.toLowerCase().includes("wormhole"),
    );
    expect(wormholeAction).not.toBeUndefined();
    expect(wormholeAction!.description.toLowerCase()).toContain("not for arbitrary rest");
  });

  test("source field round-trips the original PeerConnection", () => {
    const banner = getPeerConnectionBanner(mixedContentBlocked)!;
    expect(banner.source).toBe(mixedContentBlocked);
  });
});

// ---- getPeerConnectionBanner — invalid ----------------------------------

describe("getPeerConnectionBanner — invalid", () => {
  test("returns warning severity (not error)", () => {
    const banner = getPeerConnectionBanner(invalid);
    expect(banner).not.toBeNull();
    expect(banner!.severity).toBe("warning");
    // Rationale: same-origin still works, the page is functional, just
    // the host param is broken. Warning is more accurate than error.
  });

  test("message includes the offending input", () => {
    const banner = getPeerConnectionBanner(invalid)!;
    expect(banner.message).toContain("garbage!!!");
  });

  test("message includes the parser reason", () => {
    const banner = getPeerConnectionBanner(invalid)!;
    expect(banner.message).toContain("unrecognized host shape");
  });

  test("actions include 'remove host param' fallback", () => {
    const banner = getPeerConnectionBanner(invalid)!;
    const labels = banner.actions.map((a) => a.label.toLowerCase());
    expect(labels.some((l) => l.includes("remove"))).toBe(true);
  });

  test("actions include 'fix the URL' with concrete examples", () => {
    const banner = getPeerConnectionBanner(invalid)!;
    const fixAction = banner.actions.find((a) => a.label.toLowerCase().includes("fix"));
    expect(fixAction).not.toBeUndefined();
    expect(fixAction!.description).toContain("oracle-world");
    expect(fixAction!.description).toContain("10.20.0.7");
  });
});

// ---- shouldShowBanner ---------------------------------------------------

describe("shouldShowBanner", () => {
  test("false for same-origin", () => {
    expect(shouldShowBanner(sameOrigin)).toBe(false);
  });

  test("false for direct", () => {
    expect(shouldShowBanner(direct)).toBe(false);
  });

  test("true for mixed-content-blocked", () => {
    expect(shouldShowBanner(mixedContentBlocked)).toBe(true);
  });

  test("true for invalid", () => {
    expect(shouldShowBanner(invalid)).toBe(true);
  });
});

// ---- bannerSeverity -----------------------------------------------------

describe("bannerSeverity", () => {
  test("null for same-origin", () => {
    expect(bannerSeverity(sameOrigin)).toBeNull();
  });

  test("null for direct", () => {
    expect(bannerSeverity(direct)).toBeNull();
  });

  test("error for mixed-content-blocked", () => {
    expect(bannerSeverity(mixedContentBlocked)).toBe("error");
  });

  test("warning for invalid", () => {
    expect(bannerSeverity(invalid)).toBe("warning");
  });
});

// ---- The four-kind invariant lock ---------------------------------------

describe("the four-kind invariant", () => {
  // If PeerConnection ever gains a fifth kind, the exhaustiveness `never`
  // check in getPeerConnectionBanner will fail at compile time. This test
  // documents the runtime expectation that all four current kinds are
  // covered, with the right banner-or-null verdict for each.

  test("all four PeerConnection kinds are handled with deliberate verdicts", () => {
    expect(getPeerConnectionBanner(sameOrigin)).toBeNull();
    expect(getPeerConnectionBanner(direct)).toBeNull();
    expect(getPeerConnectionBanner(mixedContentBlocked)).not.toBeNull();
    expect(getPeerConnectionBanner(invalid)).not.toBeNull();
  });
});

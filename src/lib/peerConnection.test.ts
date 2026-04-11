/**
 * Tests for resolvePeerConnection + canFetchDirectly — iteration 5.
 *
 * These tests lock the mixed-content-rule classification and the four-kind
 * discriminated union shape. The load-bearing invariant is that
 * `mixed-content-blocked` is surfaced as a dedicated kind, NOT hidden as
 * "direct that will fail at fetch time" — so callers can show a clear
 * error instead of a mysterious fetch failure.
 */

import { describe, test, expect } from "bun:test";
import { resolvePeerConnection, canFetchDirectly } from "./peerConnection";

describe("resolvePeerConnection — same-origin path", () => {
  test("null → same-origin", () => {
    const pc = resolvePeerConnection(null);
    expect(pc.kind).toBe("same-origin");
  });

  test("undefined → same-origin", () => {
    const pc = resolvePeerConnection(undefined);
    expect(pc.kind).toBe("same-origin");
  });

  test("empty string → same-origin", () => {
    const pc = resolvePeerConnection("");
    expect(pc.kind).toBe("same-origin");
  });

  test("whitespace-only → same-origin", () => {
    const pc = resolvePeerConnection("   ");
    expect(pc.kind).toBe("same-origin");
  });
});

describe("resolvePeerConnection — direct path", () => {
  test("explicit https:// URL → direct https from any origin", () => {
    const pc = resolvePeerConnection("https://white.local:3456", "https:");
    expect(pc).toEqual({
      kind: "direct",
      protocol: "https",
      baseUrl: "https://white.local:3456",
    });
  });

  test("explicit https:// URL → direct from http origin too", () => {
    const pc = resolvePeerConnection("https://white.local:3456", "http:");
    expect(pc.kind).toBe("direct");
    if (pc.kind === "direct") expect(pc.protocol).toBe("https");
  });

  test("explicit http:// URL from http origin → direct http", () => {
    const pc = resolvePeerConnection("http://10.20.0.7:3456", "http:");
    expect(pc).toEqual({
      kind: "direct",
      protocol: "http",
      baseUrl: "http://10.20.0.7:3456",
    });
  });

  test("bare host:port defaults to https → direct", () => {
    const pc = resolvePeerConnection("white.local:3456", "https:");
    expect(pc).toEqual({
      kind: "direct",
      protocol: "https",
      baseUrl: "https://white.local:3456",
    });
  });

  test("bare hostname without port → direct https", () => {
    const pc = resolvePeerConnection("oracle-world", "https:");
    expect(pc.kind).toBe("direct");
    if (pc.kind === "direct") {
      expect(pc.protocol).toBe("https");
      expect(pc.baseUrl).toBe("https://oracle-world");
    }
  });
});

describe("resolvePeerConnection — mixed-content-blocked path (load-bearing)", () => {
  test("https origin + http peer → mixed-content-blocked", () => {
    const pc = resolvePeerConnection("http://10.20.0.7:3456", "https:");
    expect(pc.kind).toBe("mixed-content-blocked");
    if (pc.kind === "mixed-content-blocked") {
      expect(pc.peerUrl).toBe("http://10.20.0.7:3456");
      expect(pc.hint).toContain("mixed-content");
      expect(pc.hint).toContain("maw ui --from-ci");
      expect(pc.hint).toContain("/api/proxy/*");
      expect(pc.hint).toContain("/wormhole");
    }
  });

  test("https origin + http hostname (no port) → mixed-content-blocked", () => {
    const pc = resolvePeerConnection("http://oracle-world.laris.co", "https:");
    expect(pc.kind).toBe("mixed-content-blocked");
  });

  test("bare host:port does NOT trigger mixed-content (defaults to https)", () => {
    // Even from an HTTPS origin, a bare host:port is treated as https by
    // resolveHost() in src/lib/api.ts, matching the existing pattern.
    const pc = resolvePeerConnection("10.20.0.7:3456", "https:");
    expect(pc.kind).toBe("direct");
  });

  test("http origin + http peer is NOT blocked", () => {
    const pc = resolvePeerConnection("http://10.20.0.7:3456", "http:");
    expect(pc.kind).toBe("direct");
  });

  test("http origin + https peer is NOT blocked", () => {
    const pc = resolvePeerConnection("https://white.local:3456", "http:");
    expect(pc.kind).toBe("direct");
  });
});

describe("resolvePeerConnection — invalid path", () => {
  test("garbage input → invalid", () => {
    const pc = resolvePeerConnection("not a valid host!!!", "https:");
    expect(pc.kind).toBe("invalid");
    if (pc.kind === "invalid") {
      expect(pc.input).toBe("not a valid host!!!");
      expect(pc.reason).toContain("unrecognized");
    }
  });

  test("leading colon → invalid", () => {
    const pc = resolvePeerConnection(":3456", "https:");
    expect(pc.kind).toBe("invalid");
  });

  test("unknown protocol → invalid", () => {
    const pc = resolvePeerConnection("ftp://example.com", "https:");
    expect(pc.kind).toBe("invalid");
  });

  test("spaces in hostname → invalid", () => {
    const pc = resolvePeerConnection("foo bar.com", "https:");
    expect(pc.kind).toBe("invalid");
  });
});

describe("resolvePeerConnection — default origin detection", () => {
  test("when location is undefined, defaults to https (conservative)", () => {
    // In bun test, `location` is undefined — so the default should kick in.
    // HTTPS default means HTTP peers will be classified as mixed-content-blocked,
    // which is the correct conservative behavior (surfaces the problem).
    const pc = resolvePeerConnection("http://10.20.0.7:3456");
    expect(pc.kind).toBe("mixed-content-blocked");
  });

  test("explicit http origin override works even without location", () => {
    const pc = resolvePeerConnection("http://10.20.0.7:3456", "http:");
    expect(pc.kind).toBe("direct");
  });
});

describe("canFetchDirectly — convenience helper", () => {
  test("returns true for same-origin", () => {
    expect(canFetchDirectly(null)).toBe(true);
    expect(canFetchDirectly("")).toBe(true);
  });

  test("returns true for direct", () => {
    expect(canFetchDirectly("https://white.local:3456", "https:")).toBe(true);
    expect(canFetchDirectly("http://10.20.0.7:3456", "http:")).toBe(true);
  });

  test("returns false for mixed-content-blocked", () => {
    expect(canFetchDirectly("http://10.20.0.7:3456", "https:")).toBe(false);
  });

  test("returns false for invalid input", () => {
    expect(canFetchDirectly("garbage!!!", "https:")).toBe(false);
  });
});

describe("the four-kind invariant", () => {
  test("every resolvePeerConnection result matches one of the four kinds", () => {
    // Lock the discriminated union surface so adding a new kind forces a
    // deliberate update here.
    const samples = [
      null,
      "",
      "https://foo:3456",
      "http://foo:3456",
      "foo:3456",
      "garbage!!!",
    ];
    const seen = new Set<string>();
    for (const s of samples) {
      const pc = resolvePeerConnection(s, "https:");
      seen.add(pc.kind);
      expect(["same-origin", "direct", "mixed-content-blocked", "invalid"]).toContain(
        pc.kind,
      );
    }
    // All four kinds are reachable from this sample set (if the code ever
    // stops returning one, this test catches it).
    expect(seen.size).toBe(4);
  });
});

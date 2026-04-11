/**
 * Tests for WormholeClient — browser-side client for POST /api/wormhole/request.
 * Companion to src/lib/wormholeClient.ts and maw-js/test/wormhole.test.ts.
 *
 * PROTOTYPE — iteration 4 of the federation-join-easy /loop, drafted on the
 * feat/wormhole-client-draft branch. See
 * mawui-oracle/ψ/writing/federation-join-easy.md for context.
 *
 * maw-ui has no explicit test runner in package.json (only vite scripts), but
 * `bun test` works natively on `.test.ts` files and the WormholeClient has no
 * React/DOM/vite dependencies beyond `fetch` and `crypto.randomUUID` which are
 * both globals in modern bun. Runs via: `bun test src/lib/wormholeClient.test.ts`
 * from the maw-ui repo root.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  WormholeClient,
  generateAnonSignature,
  type WormholeResponse,
} from "./wormholeClient";

// ---- Pure helper tests ---------------------------------------------------

describe("generateAnonSignature", () => {
  test("produces a signature in [host:anon-<nonce>] shape", () => {
    const sig = generateAnonSignature("local.example.com");
    expect(sig).toMatch(/^\[local\.example\.com:anon-[a-f0-9]{8}\]$/);
  });

  test("different calls produce different nonces (randomness check)", () => {
    const a = generateAnonSignature("host-x");
    const b = generateAnonSignature("host-x");
    // Not a cryptographic test — just that they don't collide in the common case.
    // If this ever flakes, the underlying RNG is broken.
    expect(a).not.toBe(b);
  });

  test("preserves hostnames with dots, dashes, and colons in the host portion", () => {
    const sig = generateAnonSignature("oracle-world.laris.co:3456");
    expect(sig.startsWith("[oracle-world.laris.co:3456:anon-")).toBe(true);
  });

  test("nonce is exactly 8 hex characters", () => {
    for (let i = 0; i < 20; i++) {
      const sig = generateAnonSignature("h");
      const match = sig.match(/anon-([a-f0-9]+)\]$/);
      expect(match).not.toBeNull();
      expect(match![1].length).toBe(8);
    }
  });
});

describe("WormholeClient.isReadOnlyCmd (static helper)", () => {
  test.each([
    "/dig",
    "/dig --all 5",
    "/trace",
    "/recap",
    "/recap --now deep",
    "/standup",
    "/who-are-you",
    "/philosophy",
    "/where-we-are",
  ])("permits %s", (cmd) => {
    expect(WormholeClient.isReadOnlyCmd(cmd)).toBe(true);
  });

  test.each([
    "/awaken",
    "/commit",
    "/rrr",
    "/incubate foo/bar",
    "/diggy --deep",
    "dig",
    "",
  ])("denies %s", (cmd) => {
    expect(WormholeClient.isReadOnlyCmd(cmd)).toBe(false);
  });

  test("mirrors the server-side whitelist (same 7 verbs)", () => {
    // Load-bearing invariant: client gates + server enforcement must agree
    // so we don't show a UI button that the backend will 403.
    const SERVER_WHITELIST = [
      "/dig",
      "/trace",
      "/recap",
      "/standup",
      "/who-are-you",
      "/philosophy",
      "/where-we-are",
    ];
    for (const verb of SERVER_WHITELIST) {
      expect(WormholeClient.isReadOnlyCmd(verb)).toBe(true);
    }
  });
});

// ---- WormholeClient class tests ------------------------------------------

describe("WormholeClient — construction", () => {
  test("stores peer + generates anon signature at construction", () => {
    const wh = new WormholeClient("white", "local.example.com");
    expect(wh.peer).toBe("white");
    expect(wh.signature).toMatch(/^\[local\.example\.com:anon-[a-f0-9]{8}\]$/);
  });

  test("signature is stable for the lifetime of one instance", () => {
    const wh = new WormholeClient("white", "local.example.com");
    const sig1 = wh.signature;
    const sig2 = wh.signature;
    expect(sig1).toBe(sig2);
  });

  test("two instances produce different signatures", () => {
    const a = new WormholeClient("white", "local.example.com");
    const b = new WormholeClient("white", "local.example.com");
    expect(a.signature).not.toBe(b.signature);
  });

  test("defaults originHost to window.location.host when available", () => {
    // Stub a minimal window object
    (globalThis as any).window = { location: { host: "stubbed.example.com" } };
    try {
      const wh = new WormholeClient("white");
      expect(wh.signature.startsWith("[stubbed.example.com:anon-")).toBe(true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  test("falls back to 'unknown-origin' in non-browser environments", () => {
    // Ensure no window object
    delete (globalThis as any).window;
    const wh = new WormholeClient("white");
    expect(wh.signature.startsWith("[unknown-origin:anon-")).toBe(true);
  });
});

// ---- fetch mocking -------------------------------------------------------

describe("WormholeClient — fetch interactions", () => {
  let originalFetch: typeof fetch;
  let fetchCalls: Array<{ url: string; init?: RequestInit }>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      fetchCalls.push({ url, init });
      return handler(url, init);
    }) as typeof fetch;
  }

  test("ensureSession() GETs /api/wormhole/session", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const wh = new WormholeClient("white", "local.example.com");
    await wh.ensureSession();
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("/api/wormhole/session");
  });

  test("ensureSession() is idempotent (multiple calls → one fetch)", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const wh = new WormholeClient("white", "local.example.com");
    await wh.ensureSession();
    await wh.ensureSession();
    await wh.ensureSession();
    expect(fetchCalls.length).toBe(1);
  });

  test("ensureSession() throws on non-2xx response", async () => {
    mockFetch(() => new Response("forbidden", { status: 403 }));
    const wh = new WormholeClient("white", "local.example.com");
    await expect(wh.ensureSession()).rejects.toThrow(/session bootstrap failed.*403/);
  });

  test("request() auto-bootstraps session if caller forgets", async () => {
    mockFetch((url) => {
      if (url === "/api/wormhole/session") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ output: "ok", from: "http://white:3456", elapsed_ms: 42, status: 200, trust_tier: "readonly" }),
        { status: 200 },
      );
    });
    const wh = new WormholeClient("white", "local.example.com");
    const result = await wh.request("/dig", ["--all", "5"]);
    expect(fetchCalls[0].url).toBe("/api/wormhole/session");
    expect(fetchCalls[1].url).toBe("/api/wormhole/request");
    expect(result.output).toBe("ok");
    expect(result.trust_tier).toBe("readonly");
  });

  test("request() POSTs the correct body shape", async () => {
    mockFetch((url) => {
      if (url === "/api/wormhole/session") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ output: "ok", from: "w", elapsed_ms: 1, status: 200, trust_tier: "readonly" }),
        { status: 200 },
      );
    });
    const wh = new WormholeClient("white", "local.example.com");
    await wh.request("/dig", ["--all", "5"]);
    const postCall = fetchCalls[1];
    expect(postCall.init?.method).toBe("POST");
    const body = JSON.parse(postCall.init!.body as string);
    expect(body.peer).toBe("white");
    expect(body.cmd).toBe("/dig");
    expect(body.args).toEqual(["--all", "5"]);
    expect(body.signature).toMatch(/^\[local\.example\.com:anon-/);
  });

  test("request() defaults args to [] when not provided", async () => {
    mockFetch((url) => {
      if (url === "/api/wormhole/session") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ output: "ok", from: "w", elapsed_ms: 1, status: 200, trust_tier: "readonly" }),
        { status: 200 },
      );
    });
    const wh = new WormholeClient("white", "local.example.com");
    await wh.request("/dig");
    const body = JSON.parse(fetchCalls[1].init!.body as string);
    expect(body.args).toEqual([]);
  });

  test("request() uses same-origin credentials", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({ output: "ok", from: "w", elapsed_ms: 1, status: 200, trust_tier: "readonly" }),
        { status: 200 },
      ),
    );
    const wh = new WormholeClient("white", "local.example.com");
    await wh.ensureSession();
    await wh.request("/dig");
    expect(fetchCalls[0].init?.credentials).toBe("same-origin");
    expect(fetchCalls[1].init?.credentials).toBe("same-origin");
  });

  test("request() throws typed error with .status and .body on non-2xx", async () => {
    mockFetch((url) => {
      if (url === "/api/wormhole/session") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: "shell_peer_denied", hint: "anon is read-only" }),
        { status: 403 },
      );
    });
    const wh = new WormholeClient("white", "local.example.com");
    try {
      await wh.request("/awaken");
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("wormhole: 403");
      expect(err.message).toContain("shell_peer_denied");
      expect(err.status).toBe(403);
      expect(err.body.error).toBe("shell_peer_denied");
    }
  });

  test("request() returns a typed WormholeResponse on success", async () => {
    mockFetch((url) => {
      if (url === "/api/wormhole/session") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          output: "dig output here",
          from: "http://10.20.0.7:3456",
          elapsed_ms: 123,
          status: 200,
          trust_tier: "readonly",
        }),
        { status: 200 },
      );
    });
    const wh = new WormholeClient("white", "local.example.com");
    const result: WormholeResponse = await wh.request("/dig");
    expect(result.output).toBe("dig output here");
    expect(result.from).toBe("http://10.20.0.7:3456");
    expect(result.elapsed_ms).toBe(123);
    expect(result.status).toBe(200);
    expect(result.trust_tier).toBe("readonly");
  });
});

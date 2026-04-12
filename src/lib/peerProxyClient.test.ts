/**
 * Tests for PeerProxyClient — companion to maw-js POST /api/proxy.
 *
 * PROTOTYPE — iteration 7 of the federation-join-easy /loop, on
 * feat/wormhole-client-draft. See
 * mawui-oracle/ψ/writing/federation-join-easy.md for context.
 *
 * Mirrors peerExecClient.test.ts conventions — pure helpers, construction,
 * async fetch interactions via globalThis.fetch mock swap. Locks the
 * load-bearing invariant that GET/HEAD/OPTIONS are readonly and that the
 * client surfaces typed errors with .status + .body.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  PeerProxyClient,
  generateProxyAnonSignature,
  type PeerProxyResponse,
} from "./peerProxyClient";

// ---- Pure helper tests ---------------------------------------------------

describe("generateProxyAnonSignature", () => {
  test("produces a signature in [host:anon-<nonce>] shape", () => {
    const sig = generateProxyAnonSignature("local.example.com");
    expect(sig).toMatch(/^\[local\.example\.com:anon-[a-f0-9]{8}\]$/);
  });

  test("different calls produce different nonces", () => {
    const a = generateProxyAnonSignature("host-x");
    const b = generateProxyAnonSignature("host-x");
    expect(a).not.toBe(b);
  });

  test("preserves hostnames with dots, dashes, and ports", () => {
    const sig = generateProxyAnonSignature("oracle-world.laris.co:3456");
    expect(sig.startsWith("[oracle-world.laris.co:3456:anon-")).toBe(true);
  });

  test("nonce is exactly 8 hex chars (×20 reps)", () => {
    for (let i = 0; i < 20; i++) {
      const sig = generateProxyAnonSignature("h");
      const match = sig.match(/anon-([a-f0-9]+)\]$/);
      expect(match).not.toBeNull();
      expect(match![1].length).toBe(8);
    }
  });
});

describe("PeerProxyClient.isReadOnlyMethod (static helper)", () => {
  test.each(["GET", "HEAD", "OPTIONS"])("%s is readonly", (method) => {
    expect(PeerProxyClient.isReadOnlyMethod(method)).toBe(true);
  });

  test.each(["POST", "PUT", "PATCH", "DELETE"])("%s is NOT readonly", (method) => {
    expect(PeerProxyClient.isReadOnlyMethod(method)).toBe(false);
  });

  test("case-insensitive", () => {
    expect(PeerProxyClient.isReadOnlyMethod("get")).toBe(true);
    expect(PeerProxyClient.isReadOnlyMethod("Post")).toBe(false);
    expect(PeerProxyClient.isReadOnlyMethod("PUT")).toBe(false);
  });

  test("mirrors server-side semantics (load-bearing invariant)", () => {
    // The server (maw-js src/api/proxy.ts) classifies these exact 3 methods
    // as readonly. If either side adds or removes a method, this test
    // pair (here + maw-js test/proxy.test.ts isReadOnlyMethod) will diverge.
    const SERVER_READONLY = ["GET", "HEAD", "OPTIONS"];
    for (const m of SERVER_READONLY) {
      expect(PeerProxyClient.isReadOnlyMethod(m)).toBe(true);
    }
    const SERVER_MUTATING = ["POST", "PUT", "PATCH", "DELETE"];
    for (const m of SERVER_MUTATING) {
      expect(PeerProxyClient.isReadOnlyMethod(m)).toBe(false);
    }
  });
});

describe("PeerProxyClient.parseJsonBody (static helper)", () => {
  function fakeResponse(body: string): PeerProxyResponse {
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body,
      from: "http://stub:3456",
      elapsed_ms: 1,
      trust_tier: "readonly_method",
    };
  }

  test("parses valid JSON", () => {
    const res = fakeResponse('{"a": 1, "b": "two"}');
    expect(PeerProxyClient.parseJsonBody<{ a: number; b: string }>(res)).toEqual({
      a: 1,
      b: "two",
    });
  });

  test("parses arrays", () => {
    const res = fakeResponse("[1,2,3]");
    expect(PeerProxyClient.parseJsonBody<number[]>(res)).toEqual([1, 2, 3]);
  });

  test("throws on malformed JSON", () => {
    const res = fakeResponse("not json {");
    expect(() => PeerProxyClient.parseJsonBody(res)).toThrow(/failed to parse response body as JSON/);
  });

  test("throws on empty body", () => {
    const res = fakeResponse("");
    expect(() => PeerProxyClient.parseJsonBody(res)).toThrow();
  });
});

// ---- Construction tests --------------------------------------------------

describe("PeerProxyClient — construction", () => {
  test("stores peer + generates anon signature at construction", () => {
    const c = new PeerProxyClient("white", "local.example.com");
    expect(c.peer).toBe("white");
    expect(c.signature).toMatch(/^\[local\.example\.com:anon-[a-f0-9]{8}\]$/);
  });

  test("signature is stable for instance lifetime", () => {
    const c = new PeerProxyClient("white", "local.example.com");
    const sig1 = c.signature;
    const sig2 = c.signature;
    expect(sig1).toBe(sig2);
  });

  test("two instances produce different signatures", () => {
    const a = new PeerProxyClient("white", "local.example.com");
    const b = new PeerProxyClient("white", "local.example.com");
    expect(a.signature).not.toBe(b.signature);
  });

  test("defaults originHost to window.location.host when available", () => {
    (globalThis as any).window = { location: { host: "stubbed.example.com" } };
    try {
      const c = new PeerProxyClient("white");
      expect(c.signature.startsWith("[stubbed.example.com:anon-")).toBe(true);
    } finally {
      delete (globalThis as any).window;
    }
  });

  test("falls back to 'unknown-origin' when window is undefined", () => {
    delete (globalThis as any).window;
    const c = new PeerProxyClient("white");
    expect(c.signature.startsWith("[unknown-origin:anon-")).toBe(true);
  });
});

// ---- fetch mocking -------------------------------------------------------

describe("PeerProxyClient — fetch interactions", () => {
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

  function okProxyResponse(overrides: Partial<PeerProxyResponse> = {}): PeerProxyResponse {
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok": true}',
      from: "http://10.20.0.7:3456",
      elapsed_ms: 42,
      trust_tier: "readonly_method",
      ...overrides,
    };
  }

  test("ensureSession() GETs /api/proxy/session", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const c = new PeerProxyClient("white", "local.example.com");
    await c.ensureSession();
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("/api/proxy/session");
  });

  test("ensureSession() is idempotent (3 calls → 1 fetch)", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const c = new PeerProxyClient("white", "local.example.com");
    await c.ensureSession();
    await c.ensureSession();
    await c.ensureSession();
    expect(fetchCalls.length).toBe(1);
  });

  test("ensureSession() throws on non-2xx with descriptive error", async () => {
    mockFetch(() => new Response("forbidden", { status: 403 }));
    const c = new PeerProxyClient("white", "local.example.com");
    await expect(c.ensureSession()).rejects.toThrow(/peerProxy: session bootstrap failed.*403/);
  });

  test("get() POSTs the correct body shape with method=GET", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(JSON.stringify(okProxyResponse()), { status: 200 });
    });
    const c = new PeerProxyClient("white", "local.example.com");
    await c.get("/api/config");
    const postCall = fetchCalls[1];
    expect(postCall.url).toBe("/api/proxy");
    expect(postCall.init?.method).toBe("POST");
    expect(postCall.init?.credentials).toBe("same-origin");
    const body = JSON.parse(postCall.init!.body as string);
    expect(body.peer).toBe("white");
    expect(body.method).toBe("GET");
    expect(body.path).toBe("/api/config");
    expect(body.signature).toMatch(/^\[local\.example\.com:anon-/);
    expect(body.body).toBeUndefined();
  });

  test("post() includes body in the proxy envelope", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(JSON.stringify(okProxyResponse()), { status: 200 });
    });
    const c = new PeerProxyClient("white", "local.example.com");
    await c.post("/api/ping", '{"url": "http://other"}');
    const postBody = JSON.parse(fetchCalls[1].init!.body as string);
    expect(postBody.method).toBe("POST");
    expect(postBody.body).toBe('{"url": "http://other"}');
  });

  test("get() auto-bootstraps session if caller forgets", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(JSON.stringify(okProxyResponse()), { status: 200 });
    });
    const c = new PeerProxyClient("white", "local.example.com");
    await c.get("/api/config"); // no ensureSession() call first
    expect(fetchCalls[0].url).toBe("/api/proxy/session");
    expect(fetchCalls[1].url).toBe("/api/proxy");
  });

  test("returns typed PeerProxyResponse on success", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(
        JSON.stringify({
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"sessions": []}',
          from: "http://10.20.0.7:3456",
          elapsed_ms: 87,
          trust_tier: "readonly_method",
        }),
        { status: 200 },
      );
    });
    const c = new PeerProxyClient("white", "local.example.com");
    const result: PeerProxyResponse = await c.get("/api/sessions");
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"sessions": []}');
    expect(result.from).toBe("http://10.20.0.7:3456");
    expect(result.elapsed_ms).toBe(87);
    expect(result.trust_tier).toBe("readonly_method");
  });

  test("throws typed error with .status and .body on non-2xx", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(
        JSON.stringify({ error: "mutation_denied", hint: "anon is read-only" }),
        { status: 403 },
      );
    });
    const c = new PeerProxyClient("white", "local.example.com");
    try {
      await c.post("/api/ping", '{"url":"x"}');
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("peerProxy: 403");
      expect(err.message).toContain("mutation_denied");
      expect(err.message).toContain("POST /api/ping");
      expect(err.status).toBe(403);
      expect(err.body.error).toBe("mutation_denied");
    }
  });

  test("HTTP method shortcuts call request() with correct method", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(JSON.stringify(okProxyResponse()), { status: 200 });
    });
    const c = new PeerProxyClient("white", "local.example.com");
    await c.ensureSession();

    await c.get("/api/config");
    await c.head("/api/config");
    await c.options("/api/config");
    await c.post("/api/config", "{}");
    await c.put("/api/config", "{}");
    await c.patch("/api/config", "{}");
    await c.delete("/api/config");

    // Skip the session call (index 0); 7 method calls follow
    const methodsCalled = fetchCalls
      .slice(1)
      .map((call) => JSON.parse(call.init!.body as string).method);
    expect(methodsCalled).toEqual(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);
  });

  test("get() round-trips JSON via parseJsonBody", async () => {
    mockFetch((url) => {
      if (url === "/api/proxy/session") return new Response('{"ok":true}', { status: 200 });
      return new Response(
        JSON.stringify(okProxyResponse({ body: '{"hello":"world","count":42}' })),
        { status: 200 },
      );
    });
    const c = new PeerProxyClient("white", "local.example.com");
    const res = await c.get("/api/config");
    const parsed = PeerProxyClient.parseJsonBody<{ hello: string; count: number }>(res);
    expect(parsed.hello).toBe("world");
    expect(parsed.count).toBe(42);
  });
});

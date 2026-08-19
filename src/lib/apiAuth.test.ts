import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import * as api from "./api";
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalFetch = globalThis.fetch;
const stored = new Map<string, string>();
const storage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { location: new URL("https://ui.example/app") },
});
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
type FetchCall = { url: string; init?: RequestInit & { targetAddressSpace?: string } };
let calls: FetchCall[];
const ticket = `mwt1_${"a".repeat(64)}`;
const verified = (body: object = { protocol: "maw.ws.v1", ticket }, headers: HeadersInit = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
}) => new Response(JSON.stringify(body), { status: 200, headers });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
async function install(token: string, origin = "https://ui.example") {
  if (origin !== "https://ui.example") api.setStoredHost(origin);
  expect(await api.authenticateOperator(token)).toBe("authenticated");
  calls = [];
}
beforeEach(() => {
  stored.clear();
  calls = [];
  api.clearOperatorCredential();
  api.clearStoredHost();
  api.resetHttpHealth();
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return verified();
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else delete (globalThis as { window?: unknown }).window;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});
describe("operator API origin boundary", () => {
  test("canonicalizes web origins and exposes mixed content", () => {
    expect(api.canonicalizeBackendOrigin("WHITE.local:443/", "https:")).toEqual({
      exactOrigin: "https://white.local",
      mixedContent: false,
    });
    expect(api.canonicalizeBackendOrigin("http://white.local:3456", "https:")).toEqual({
      exactOrigin: "http://white.local:3456",
      mixedContent: true,
    });
  });

  test("rejects malformed, non-web, and non-origin inputs", () => {
    for (const value of ["", "//evil.test", "ftp://good.test", "javascript:alert(1)", "https://@good.test",
      "https://:@good.test", "https://user:pass@good.test", "https://good.test/path", "https://good.test?q=1",
      "https://good.test?", "https://good.test/#frag", "https://good.test#", "https://good.test?#",
      "https://good.test.evil/path", "https://good.test/a/..", "https://good.test/./", "good.test/%2e", "https://good.test\\a\\..", "good.test\\."]) {
      expect(() => api.canonicalizeBackendOrigin(value, "https:")).toThrow("invalid_backend_origin");
    }
  });
  test("validates a bounded token without persisting or exposing it", async () => {
    const token = "Byte.Exact_+/=~Token";
    expect(await api.authenticateOperator(token)).toBe("authenticated");
    expect(api.hasOperatorCredential()).toBe(true);
    expect([...stored.values()].join("|")).not.toContain(token);
    for (const invalid of ["   ", "x".repeat(4097), "snowman-☃"]) {
      expect(await api.authenticateOperator(invalid)).toBe("invalid_response");
    }
  });
});
describe("secure apiFetch", () => {
  test("attaches byte-exact Bearer only at the exact active origin", async () => {
    const token = "AbC_+/=.:~opaque";
    await install(token, "https://good.example");
    await api.apiFetch("/api/config?full=1", { headers: { "X-Test": "yes" }, credentials: "include", redirect: "follow" });
    const headers = calls[0].init?.headers as Headers;
    expect(calls[0].url).toBe("https://good.example/api/config?full=1");
    expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("X-Test")).toBe("yes");
    expect(calls[0].init?.credentials).toBe("omit");
    expect(calls[0].init?.redirect).toBe("error");
    api.setStoredHost("https://good.example.evil");
    expect(api.hasOperatorCredential()).toBe(false);
    await api.apiFetch("/api/config");
    expect((calls[1].init?.headers as Headers).has("Authorization")).toBe(false);
  });
  test("host mutations clear credentials synchronously", async () => {
    await install("opaque-token", "https://future.example");
    api.setStoredHost("https://FUTURE.example:443/");
    expect(api.hasOperatorCredential()).toBe(false);
    await install("local-token");
    api.clearStoredHost();
    expect(api.hasOperatorCredential()).toBe(false);
  });

  test("rejects caller auth headers and paths that escape /api/", async () => {
    for (const headers of [new Headers({ authorization: "Bearer caller" }), new Headers({ "X-Maw-Token": "caller" })]) {
      await expect(api.apiFetch("/api/config", { headers })).rejects.toThrow("caller_auth_forbidden");
    }
    for (const path of ["https://ui.example/api/x", "//evil/api/x", "/config", "/api.evil/x",
      "/api/../secret", "/api/x#fragment", "/api/\\evil.test/x"]) {
      await expect(api.apiFetch(path)).rejects.toThrow("invalid_api_path");
    }
    expect(calls).toHaveLength(0);
  });

  test("preserves private-network policy and redacts token-bearing fetch errors", async () => {
    const token = "never-leak-this-token";
    await install(token, "https://localhost:3456");
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: "captured", init });
      throw new Error(encodeURIComponent(token), { cause: token });
    }) as unknown as typeof fetch;
    const thrown = await api.apiFetch("/api/config").catch(error => error);
    expect(thrown.message).toBe("api_fetch_failed");
    expect(thrown.cause).toBeUndefined();
    expect(calls[0].init?.targetAddressSpace).toBe("loopback");
    expect(JSON.stringify(api.getHttpHealth())).not.toContain(token);
  });

  test("redacts caller aborts without affecting credentials or the circuit", async () => {
    const token = "abort-secret-token";
    await install(token);
    globalThis.fetch = (async () => {
      throw new DOMException(`cancelled ${token}`, "AbortError");
    }) as unknown as typeof fetch;
    for (let i = 0; i < 6; i++) {
      const thrown = await api.apiFetch("/api/oracle/search").catch(error => error);
      expect(thrown.name).toBe("AbortError");
      expect(thrown.message).toBe("request_aborted");
      expect(thrown.cause).toBeUndefined();
    }
    expect(api.hasOperatorCredential()).toBe(true);
    expect(api.getHttpHealth()).toEqual({ healthy: true, consecutiveFails: 0, openUntil: 0, lastError: null });
  });

  test("keeps the five-failure circuit breaker", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    for (let i = 0; i < 5; i++) await expect(api.apiFetch("/api/config")).rejects.toThrow("offline");
    expect(api.getHttpHealth().healthy).toBe(false);
    await expect(api.apiFetch("/api/config")).rejects.toThrow("circuit_open");
  });
});
describe("verified credential lifecycle", () => {
  test("keeps the candidate local until an exact current proof commits once", async () => {
    const token = "byte.Exact_+/=~candidate";
    const gate = deferred<Response>();
    api.setStoredHost("https://localhost:3456");
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).endsWith("/ws-ticket") ? gate.promise : new Response("{}");
    }) as typeof fetch;
    let notifications = 0;
    const unsubscribe = api.subscribeOperatorCredential(() => { notifications++; });
    const controller = new AbortController();
    const pending = api.authenticateOperator(token, controller.signal);
    expect(api.hasOperatorCredential()).toBe(false);
    await api.apiFetch("/api/config");
    const request = calls[0];
    expect(request.url).toBe("https://localhost:3456/api/auth/ws-ticket");
    expect(Object.fromEntries((request.init?.headers as Headers).entries())).toEqual({
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    });
    expect({ ...request.init, headers: undefined }).toMatchObject({
      method: "POST", body: '{"path":"/ws"}', credentials: "omit", redirect: "error",
      cache: "no-store", signal: controller.signal, targetAddressSpace: "loopback",
    });
    expect((calls[1].init?.headers as Headers).has("Authorization")).toBe(false);
    gate.resolve(verified());
    expect(await pending).toBe("authenticated");
    expect(api.hasOperatorCredential()).toBe(true);
    expect(notifications).toBe(1);
    expect(JSON.stringify([...stored])).not.toMatch(new RegExp(`${token}|${ticket}`));
    expect(calls.every(call => !call.url.includes(token) && !call.url.includes(ticket))).toBe(true);
    unsubscribe();
  });
  test("returns fixed outcomes without inspecting denial bodies", async () => {
    const secret = "denial-secret";
    const cases: [Response | Error, api.OperatorAuthOutcome][] = [
      [new Response(secret, { status: 401, statusText: secret }), "unauthorized"],
      [new Response(secret, { status: 403, statusText: secret }), "forbidden"],
      [new Response(secret, { status: 503, statusText: secret }), "unavailable"],
      [new Error(secret), "unavailable"],
      [new DOMException(secret, "AbortError"), "aborted"],
      [new Response("{", { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }), "invalid_response"],
    ];
    for (const [result, outcome] of cases) {
      globalThis.fetch = (async () => {
        if (result instanceof Error) throw result;
        return result;
      }) as unknown as typeof fetch;
      const actual = await api.authenticateOperator("candidate-secret");
      expect(actual).toBe(outcome);
    }
  });
  test("rejects every malformed success shape", async () => {
    const invalid = [
      verified(undefined, { "Cache-Control": "no-store" }),
      verified(undefined, { "Content-Type": "text/json", "Cache-Control": "no-store" }),
      verified(undefined, { "Content-Type": "application/json" }),
      verified(undefined, { "Content-Type": "application/json", "Cache-Control": "private" }),
      verified({ protocol: "maw.ws.v2", ticket }),
      verified({ protocol: "maw.ws.v1", ticket: `other_${"a".repeat(64)}` }),
      verified({ protocol: "maw.ws.v1", ticket: `mwt1_${"A".repeat(64)}` }),
      verified({ protocol: "maw.ws.v1", ticket: `mwt1_${"a".repeat(63)}` }),
      verified({ protocol: "maw.ws.v1", ticket, extra: true }),
    ];
    for (const response of invalid) {
      globalThis.fetch = (async () => response) as unknown as typeof fetch;
      expect(await api.authenticateOperator("candidate")).toBe("invalid_response");
    }
  });
  test("makes late attempts inert in both completion orders", async () => {
    for (const order of ["AB", "BA"] as const) {
      const aGate = deferred<Response>();
      const bGate = deferred<Response>();
      const queue = [aGate, bGate];
      globalThis.fetch = (async () => queue.shift()!.promise) as unknown as typeof fetch;
      const a = api.authenticateOperator("token-A");
      const b = api.authenticateOperator("token-B");
      for (const name of order) (name === "A" ? aGate : bGate).resolve(verified());
      expect(await a).toBe("stale");
      expect(await b).toBe("authenticated");
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: "winner", init }); return new Response("{}");
      }) as unknown as typeof fetch;
      await api.apiFetch("/api/config");
      expect((calls.at(-1)!.init?.headers as Headers).get("Authorization")).toBe("Bearer token-B");
      api.clearOperatorCredential();
    }
  });
  test("host changes, clear, and stale 401 cannot mutate a winner", async () => {
    for (const invalidate of [() => api.setStoredHost("https://other.example"),
      () => api.clearStoredHost(), () => api.clearOperatorCredential()]) {
      const gate = deferred<Response>();
      globalThis.fetch = (async () => gate.promise) as unknown as typeof fetch;
      const pending = api.authenticateOperator("old-token");
      invalidate();
      gate.resolve(verified());
      expect(await pending).toBe("stale");
      expect(api.hasOperatorCredential()).toBe(false);
    }
    api.clearStoredHost();
    await install("winner-A");
    const oldRequest = deferred<Response>();
    globalThis.fetch = (async (url: string | URL | Request) =>
      String(url).endsWith("/ws-ticket") ? verified() : oldRequest.promise) as typeof fetch;
    const stale401 = api.apiFetch("/api/config");
    expect(await api.authenticateOperator("winner-B")).toBe("authenticated");
    oldRequest.resolve(new Response("ignored", { status: 401 }));
    expect((await stale401).status).toBe(401);
    expect(api.hasOperatorCredential()).toBe(true);
  });
  test("rejects mixed content before fetch and ignores legacy unlock storage", async () => {
    stored.set("office-unlocked", "1");
    api.setStoredHost("http://backend.example:3456");
    expect(api.hasOperatorCredential()).toBe(false);
    expect(await api.authenticateOperator("candidate")).toBe("invalid_response");
    expect(calls).toHaveLength(0);
  });
});

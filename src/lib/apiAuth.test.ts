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
beforeEach(() => {
  stored.clear();
  calls = [];
  api.clearOperatorCredential();
  api.clearStoredHost();
  api.resetHttpHealth();
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
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
  test("validates a bounded token without persisting or exposing it", () => {
    const token = "Byte.Exact_+/=~Token";
    api.setOperatorCredential("https://ui.example", token);
    expect(api.hasOperatorCredential()).toBe(true);
    expect([...stored.values()].join("|")).not.toContain(token);
    for (const invalid of ["   ", "x".repeat(4097), "snowman-☃"]) {
      expect(() => api.setOperatorCredential("https://ui.example", invalid)).toThrow("invalid_operator_token");
    }
  });
});
describe("secure apiFetch", () => {
  test("attaches byte-exact Bearer only at the exact active origin", async () => {
    const token = "AbC_+/=.:~opaque";
    api.setStoredHost("https://good.example");
    api.setOperatorCredential("https://good.example", token);
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
  test("canonical same-host changes retain credentials; real changes clear synchronously", () => {
    api.setStoredHost("https://GOOD.example:443/");
    api.setOperatorCredential("future.example", "opaque-token");
    api.setStoredHost("https://future.example");
    expect(api.hasOperatorCredential()).toBe(false);
    api.setOperatorCredential("future.example", "opaque-token");
    api.setStoredHost("https://FUTURE.example:443/");
    expect(api.hasOperatorCredential()).toBe(true);
    api.setOperatorCredential("https://ui.example", "local-token");
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
    api.setStoredHost("https://localhost:3456");
    api.setOperatorCredential("https://localhost:3456", token);
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
    api.setOperatorCredential("https://ui.example", token);
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

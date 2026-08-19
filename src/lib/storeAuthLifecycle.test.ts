import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");

describe("store operator-auth lifecycle", () => {
  test("does not schedule backend synchronization during unauthenticated module evaluation", () => {
    expect(source).not.toContain("// Load asks from server on startup");
    expect(source).toContain("subscribeOperatorCredential");
    expect(source).toContain("hasOperatorCredential() ? startStoreSync() : stopStoreSync()");
  });

  test("makes start idempotent and cancels every delayed write on relock", () => {
    expect(source).toContain("if (syncActive) return");
    expect(source).toContain("clearTimeout(writeTimer)");
    expect(source).toContain("clearTimeout(askSaveTimer)");
    expect(source).toContain("pendingWrite = null");
  });
});

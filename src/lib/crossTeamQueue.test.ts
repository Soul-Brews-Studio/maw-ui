import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const source = (file: string) => readFileSync(resolve(import.meta.dir, file), "utf8");

describe("cross-team decisions queue security and lifecycle", () => {
  test("uses apiFetch, pauses hidden-tab polling, and copies when window.open returns null", () => {
    expect(source("crossTeamQueue.ts")).toContain("apiFetch(");
    const inbox = source("../components/InboxView.tsx");
    expect(inbox).toContain("useVisibleInterval(loadQueue, 30_000)");
    expect(inbox).toMatch(/if \(!window\.open\([^)]+\)\) copyQueuePath/);
  });
});

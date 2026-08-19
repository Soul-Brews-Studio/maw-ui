import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const selectedBackendFiles = {
  // Shipped React/Vite selected-backend scope only; legacy raw HTML pages are deferred.
  "src/apps/federation.tsx": 3,
  "src/apps/workspace.tsx": 2,
  "src/components/ConfigView.tsx": 8,
  "src/components/DashboardPro.tsx": 5,
  "src/components/DashboardView.tsx": 1,
  "src/components/JarvisView.tsx": 2,
  "src/components/OracleSearch.tsx": 2,
  "src/components/StatusBar.tsx": 1,
  "src/components/WorktreeView.tsx": 2,
  "src/components/chat/useChatLog.ts": 1,
  "src/hooks/useFederationData.ts": 4,
  "src/hooks/useFederationList.ts": 2,
  "src/hooks/useSessions.ts": 1,
} as const;
const source = (file: string) => readFileSync(resolve(import.meta.dir, "../..", file), "utf8");
const rawFetches = (text: string) => text.match(/\bfetch\s*\(/g) ?? [];

describe("selected-backend HTTP source inventory", () => {
  test("routes the exact 34 shipped requests, including Jarvis, through apiFetch", () => {
    let total = 0;
    for (const [file, count] of Object.entries(selectedBackendFiles)) {
      const calls = source(file).match(/\bapiFetch\s*\(/g) ?? [];
      expect(calls).toHaveLength(count);
      total += calls.length;
    }
    expect(total).toBe(34);
    // ConfigView's candidate probe is the sole raw fetch in this selected-file set.
    const shipped = Object.keys(selectedBackendFiles).map(source).join("\n");
    expect(rawFetches(shipped)).toHaveLength(1);
  });

  test("keeps exactly one post-auth candidate /api/config probe raw", () => {
    const probes = [
      ["src/components/ConfigView.tsx", "`${base}/api/config`"],
    ] as const;
    for (const [file, target] of probes) {
      const text = source(file);
      expect(rawFetches(text)).toHaveLength(1);
      expect(text).toContain(`fetch(${target}`);
      const call = text.slice(text.indexOf(`fetch(${target}`), text.indexOf(");", text.indexOf(`fetch(${target}`)) + 2);
      expect(call).not.toMatch(/Authorization|X-Maw-Token|apiFetch/);
    }
  });
});

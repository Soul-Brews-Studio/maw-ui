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

  test("keeps ConnectPage network-free and only the Config candidate probe raw", () => {
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
    expect(rawFetches(source("src/components/ConnectPage.tsx"))).toHaveLength(0);
  });

  test("never re-introduces a ?host= URL consumer in api.ts (credential-exfil via attacker-named origin)", () => {
    const text = source("src/lib/api.ts");
    // #111: an import-time `?host=` consumer let an attacker choose where the
    // operator token gets sent (auth.ts POSTs Authorization: Bearer <token>
    // to activeBackendOrigin(), which read straight from this parameter).
    // Every host selection must come from a deliberate human form submission
    // (ConnectPage / ConfigView / the operator gate's "Change host" form),
    // never from parsing the URL.
    expect(text).not.toMatch(/URLSearchParams/);
    expect(text).not.toMatch(/params\.get\(\s*["']host["']\s*\)/);
    expect(text).not.toMatch(/location\.replace/);
  });

  test("every /ws consumer goes through openWs, never a raw WebSocket constructor", () => {
    // A token-configured maw serve refuses any Origin-bearing upgrade without a
    // one-use ticket, and browsers always send Origin. api.ts owns the only
    // legitimate `new WebSocket(` — anywhere else silently 401s at runtime.
    // This caught /ws/pty, TerminalView and useChatLog being missed the first time.
    const consumers = [
      "src/hooks/useWebSocket.ts",
      "src/components/XTerminal.tsx",
      "src/components/TerminalView.tsx",
      "src/components/chat/useChatLog.ts",
    ];
    for (const file of consumers) {
      const text = source(file);
      expect(text).toContain("openWs(");
      expect(text.match(/new WebSocket\s*\(/g) ?? []).toHaveLength(0);
    }
    expect((source("src/lib/api.ts").match(/new WebSocket\s*\(/g) ?? []).length).toBe(2);
  });

  test("setStoredHost persists only the canonicalized exact origin, never raw input", () => {
    const text = source("src/lib/api.ts");
    const fn = text.slice(text.indexOf("export function setStoredHost"), text.indexOf("\n}", text.indexOf("export function setStoredHost")));
    expect(fn).toContain("next.exactOrigin");
    expect(fn).not.toMatch(/setItem\(STORAGE_KEY,\s*host\)/);
  });
});

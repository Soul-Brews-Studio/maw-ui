import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const roots = ["index", "mission", "fleet", "dashboard", "terminal", "office", "overview",
  "chat", "config", "inbox", "federation", "federation_2d", "workspace"];
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("operator bootstrap source boundary", () => {
  test("routes all 13 shipped roots through the sole createRoot bootstrap", () => {
    for (const root of roots) expect(read(`${root}.html`)).toContain('src="/src/boot.tsx"');
    const sources = ["src/main.tsx", ...roots.slice(1).map(name => `src/apps/${name}.tsx`),
      "src/core/mount.tsx", "src/boot.tsx"].map(read).join("\n");
    expect(sources.match(/createRoot\s*\(/g)).toHaveLength(1);
    expect(read("src/boot.tsx")).not.toMatch(/^import .*\.(?:\/)?(?:App|apps\/)/m);
  });

  test("keeps legacy PIN authority out of shipped application paths", () => {
    expect(read("src/main.tsx") + read("src/core/AppShell.tsx")).not.toContain("PinLock");
    expect(read("src/components/ConfigView.tsx")).not.toContain("<PinSettings");
  });

  test("open-mode escape hatch is a build-time-only flag, never a runtime/server signal", () => {
    const api = read("src/lib/api.ts");
    // Must be gated by exactly one thing: a statically-replaced Vite env var.
    // If this ever starts reading from a fetch response or server-reported
    // state, an attacker-controlled server could claim "I'm open" and bypass
    // the gate — the same reason maw-rs's own backward-compatible open mode
    // must never be trusted client-side.
    expect(api).toMatch(/export const OPEN_MODE = import\.meta\.env\.VITE_OPEN_MODE === "1";/);
    const line = api.slice(api.indexOf("export const OPEN_MODE ="), api.indexOf("\n", api.indexOf("export const OPEN_MODE =")));
    expect(line).not.toMatch(/hasOperatorCredential|activeBackendOrigin|fetch\(|response|window\./);
    // Defined once, imported everywhere — a second copy can drift out of sync.
    expect(read("src/core/mount.tsx")).not.toMatch(/const OPEN_MODE =/);
    expect(read("src/core/mount.tsx")).toMatch(/import \{ OPEN_MODE,/);
    // The mount() call site must actually branch on it, not define it unused.
    expect(read("src/core/mount.tsx")).toMatch(/\.render\(OPEN_MODE \?/);
  });

  test("apiFetch's fail-closed check honours OPEN_MODE, so HTTP is not dead in open builds", () => {
    // Regression: #108 made apiFetch fail closed without a credential, and
    // OPEN_MODE compiles the gate out so no credential is ever installed.
    // Together they killed all ~50 apiFetch call sites (capture previews,
    // dashboard, config, search, uploads) while WebSocket features kept
    // working — so the app looked alive with every HTTP panel empty.
    const api = read("src/lib/api.ts");
    expect(api).toMatch(/if \(!OPEN_MODE && !requestCredential\) throw new Error\("operator_auth_required"\);/);
    // The unconditional form must not survive anywhere.
    expect(api).not.toMatch(/^\s*if \(!requestCredential\) throw/m);
  });
});

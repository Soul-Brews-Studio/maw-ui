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
    const mount = read("src/core/mount.tsx");
    // Must be gated by exactly one thing: a statically-replaced Vite env var.
    // If this ever starts reading from api.ts (activeBackendOrigin, a fetch
    // response, isPrivateHost, etc.) instead, an attacker-controlled server
    // could claim "I'm open" and bypass the gate the same way maw-rs's own
    // backward-compatible open mode must never be trusted client-side.
    expect(mount).toMatch(/const OPEN_MODE = import\.meta\.env\.VITE_OPEN_MODE === "1";/);
    const openModeLine = mount.slice(mount.indexOf("const OPEN_MODE ="), mount.indexOf("\n", mount.indexOf("const OPEN_MODE =")));
    expect(openModeLine).not.toMatch(/hasOperatorCredential|activeBackendOrigin|fetch\(|api\./);
    // The mount() call site must actually branch on it — not just define it unused.
    expect(mount).toMatch(/mount\(load: Loader\) \{\s*\n\s*createRoot\(document\.getElementById\("root"\)!\)\.render\(OPEN_MODE \?/);
  });
});

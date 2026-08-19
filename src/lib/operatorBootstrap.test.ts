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
});

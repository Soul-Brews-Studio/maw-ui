import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { selectBackendHost } from "./components/ConnectPage";
const root = resolve(import.meta.dir, "..");
const source = (file: string) => readFileSync(resolve(root, file), "utf8");
const apps = ["main", "chat", "config", "dashboard", "fleet", "inbox", "mission", "office",
  "overview", "terminal", "federation", "federation_2d", "workspace"];
describe("operator bootstrap activation inventory", () => {
  test("routes all 13 React documents through the closed dynamic bootstrap", async () => {
    const bootstrap = source("src/bootstrap.tsx");
    for (const app of apps) {
      const html = app === "main" ? "index.html" : `${app}.html`;
      expect(source(html)).toContain('src="/src/bootstrap.tsx"');
      const entry = app === "main" ? 'index: () => import("./main")' : `${app}: () => import("./apps/${app}")`;
      expect(bootstrap).toContain(entry);
    }
    expect(bootstrap.match(/\(\) => import\(/g)).toHaveLength(13);
    expect(bootstrap).not.toMatch(/^import .*\/(?:App|apps\/|store|hooks\/)/m);
    const { deferOnce, loaderForPath } = await import("./bootstrap");
    expect(apps.every(app => loaderForPath(app === "main" ? "/" : `/${app}.html`))).toBe(true);
    expect(apps.slice(1).every(app => loaderForPath(`/nested/${app}/`))).toBe(true);
    expect(loaderForPath("/unknown.html")).toBeNull();
    let calls = 0;
    const ready = deferOnce(async () => { calls++; }, () => {});
    expect(calls).toBe(0);
    ready();
    ready();
    await new Promise<void>(queueMicrotask);
    expect(calls).toBe(1);
  });
  test("has one shared root and no reachable legacy PIN authority", () => {
    const files = readdirSync(resolve(root, "src"), { recursive: true })
      .filter(file => /\.[jt]sx?$/.test(String(file))).map(String);
    expect(files.flatMap(file => source(`src/${file}`).match(/createRoot\s*\(/g) ?? [])).toHaveLength(1);
    expect(source("src/main.tsx") + source("src/core/AppShell.tsx")).not.toContain("PinLock");
    expect(source("src/components/ConfigView.tsx")).not.toContain("<PinSettings");
  });
  test("keeps host selection network-free", () => {
    expect(source("src/components/ConnectPage.tsx")).not.toMatch(/\bfetch\s*\(/);
    expect(source("src/lib/api.ts")).not.toMatch(/URLSearchParams|location\.replace/);
    for (const [input, expected] of [["https://good.test/path", "invalid"],
      ["http://good.test", "mixed"]] as const) {
      const persisted: string[] = [];
      let reloads = 0;
      expect(selectBackendHost(input, "https:", value => persisted.push(value), () => { reloads++; })).toBe(expected);
      expect(persisted).toHaveLength(0);
      expect(reloads).toBe(0);
    }
  });
});

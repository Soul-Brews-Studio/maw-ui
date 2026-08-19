import { beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const root = import.meta.dir;
const gated = [
  "index.html", "mission.html", "fleet.html", "dashboard.html", "terminal.html",
  "office.html", "overview.html", "chat.html", "config.html", "inbox.html",
  "federation.html", "federation_2d.html", "workspace.html",
];
const unshipped = ["arena.html", "talk.html", "timemachine.html", "shrine.html"];

function viteInputs(source: string): string[] {
  return [...source.matchAll(/resolve\(__dirname, "([^"]+\.html)"\)/g)].map((match) => match[1]);
}

describe("legacy document retirement", () => {
  const dist = resolve(root, "dist");

  beforeAll(() => {
    const build = Bun.spawnSync(["bun", "run", "build"], {
      cwd: root,
      env: process.env,
      stderr: "pipe",
      stdout: "pipe",
    });
    expect(build.exitCode, build.stderr.toString()).toBe(0);
  }, 30_000);

  test("source inventory ships 13 gated documents and retires all four legacy documents", async () => {
    const source = await Bun.file(resolve(root, "vite.config.ts")).text();
    expect(viteInputs(source).sort()).toEqual(gated.toSorted());
    expect([...gated, ...unshipped]).toHaveLength(17);
  });

  test("built output contains gated documents and no retired legacy documents", async () => {
    for (const document of gated) expect(await Bun.file(resolve(dist, document)).exists()).toBe(true);
    for (const document of unshipped) expect(await Bun.file(resolve(dist, document)).exists()).toBe(false);
  });
});

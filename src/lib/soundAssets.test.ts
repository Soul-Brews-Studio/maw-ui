import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

describe("sound assets", () => {
  test("every audio path in sounds.ts resolves to a file that ships", () => {
    // Regression: the Saiyan clips referenced "/office/saiyan.mp3" from the
    // maw-js extraction (99758ae), where the app was served under an /office/
    // prefix. In this repo the files sit at the web root, so every clip 404'd
    // and the picker offered a profile that silently played nothing — from
    // March until 2026-08-20. A missing asset must fail the build, not the user.
    const src = read("src/lib/sounds.ts");
    const paths = [...src.matchAll(/"(\/[A-Za-z0-9_\-./]+\.(?:mp3|wav|ogg))"/g)].map(m => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(existsSync(new URL(`public${p}`, root))).toBe(true);
    }
  });

  test("no lingering /office/ asset prefix from the maw-js extraction", () => {
    const src = read("src/lib/sounds.ts");
    expect(src).not.toMatch(/"\/office\//);
  });
});

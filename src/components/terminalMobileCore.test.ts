import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./TerminalView.tsx", import.meta.url), "utf8");

describe("mobile terminal core layout", () => {
  test("provides a narrow-screen drawer and touch input", () => {
    expect(source).toContain("const { isNarrow } = useDevice()");
    expect(source).toContain('aria-label="Open terminal sessions"');
    expect(source).toContain('aria-label="Terminal input"');
    expect(source).toContain("setDrawerOpen(false)");
  });

  test("auto-selects the first mobile window", () => {
    expect(source).toContain("if (!isNarrow || selectedTarget)");
    expect(source).toContain("selectWindow(`${firstSession.name}:${firstWindow.index}`)");
  });
});

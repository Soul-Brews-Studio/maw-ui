import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./TerminalView.tsx", import.meta.url), "utf8");

describe("mobile terminal tools", () => {
  test("offers assist keys and copy/search controls", () => {
    expect(source).toContain('aria-label="Terminal assist keys"');
    expect(source).toContain('aria-label="Search terminal output"');
    expect(source).toContain("navigator.clipboard.writeText");
    expect(source).toContain("<mark");
  });

  test("downloads a dependency-free PNG screenshot", () => {
    expect(source).toContain('canvas.toBlob(blob =>');
    expect(source).toContain('link.download = `terminal-');
    expect(source).not.toContain("html2canvas");
  });
});

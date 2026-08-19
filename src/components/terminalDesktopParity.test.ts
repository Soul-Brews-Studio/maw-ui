import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("./TerminalModal.tsx", import.meta.url), "utf8");
const terminal = readFileSync(new URL("./TerminalView.tsx", import.meta.url), "utf8");

describe("desktop terminal deep-link parity", () => {
  test("keeps desktop deep-links in TerminalView instead of opening TerminalModal", () => {
    expect(app).toContain("route === \"terminal\" && !isNarrow");
    expect(app).toContain("setHashTerminalTarget(match.target)");
    expect(app).toContain("initialTarget={hashTerminalTarget}");
    expect(terminal).toContain("initialTarget?: string | null");
    expect(terminal).toContain("selectWindow(initialTarget)");
  });

  test("closes TerminalModal on capture-phase Escape", () => {
    expect(modal).toContain('window.addEventListener("keydown", handler, true)');
    expect(modal).toContain('window.removeEventListener("keydown", handler, true)');
  });
});

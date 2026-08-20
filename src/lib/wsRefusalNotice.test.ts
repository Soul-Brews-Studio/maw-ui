import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { wsRefusalNotice } from "./wsRefusalNotice";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("websocket refusal notice", () => {
  test("open builds name the real cause and both remedies", () => {
    const { title, detail } = wsRefusalNotice(true);
    expect(title).toMatch(/refuses/i);
    // The whole point is that a silent 0-agents becomes an actionable sentence:
    // it must say what is wrong, why this build cannot fix itself, and the two
    // ways out. Losing any of these makes it noise.
    expect(detail).toMatch(/without operator auth/i);
    expect(detail).toMatch(/ticket/i);
    expect(detail).toMatch(/gated build/i);
    expect(detail).toMatch(/downgrade/i);
    expect(detail).toMatch(/v26\.8\.18/);
  });

  test("gated builds point at the credential, not at the build", () => {
    const { detail } = wsRefusalNotice(false);
    expect(detail).toMatch(/credential/i);
    expect(detail).toMatch(/re-authenticate/i);
    // Must NOT tell an operator with a working gate to downgrade their backend.
    expect(detail).not.toMatch(/downgrade/i);
  });

  test("both variants assert HTTP is working, so callers must gate on health", () => {
    for (const openMode of [true, false]) {
      expect(wsRefusalNotice(openMode).detail).toMatch(/HTTP works/);
    }
    // The claim above is only true while httpHealth.healthy — if HTTP were also
    // down the host is simply unreachable and a different branch explains it.
    // Both shells must therefore gate the banner on health.
    for (const file of ["src/App.tsx", "src/core/AppShell.tsx"]) {
      expect(read(file)).toMatch(/refusalVisible\s*=\s*!?!?wsRefused && httpHealth\.healthy/);
    }
  });

  test("refusal is only raised for a socket that never opened", () => {
    // A connection that worked and later dropped is an ordinary disconnect;
    // flagging it as "backend refuses this build" would be actively misleading.
    const hook = read("src/hooks/useWebSocket.ts");
    expect(hook).toMatch(/if \(!everOpened && attempt \+ 1 >= REFUSED_AFTER\) setRefused\(true\);/);
    expect(hook).toMatch(/everOpened = true;/);
    expect(hook).toMatch(/setRefused\(false\);/); // cleared on a successful open
  });
});

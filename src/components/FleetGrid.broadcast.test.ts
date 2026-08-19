import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { selectBroadcastAgents } from "./FleetGrid";

const agents = [
  { name: "ready", status: "ready", target: "s:0" },
  { name: "busy", status: "busy", target: "s:1" },
  { name: "idle", status: "idle", target: "s:2" },
  { name: "live", status: "ready", target: "s:3" },
] as any;

describe("broadcast targeting", () => {
  test("defaults to ready agents and can explicitly include busy/idle agents", () => {
    expect(selectBroadcastAgents(agents, false).map(agent => agent.name)).toEqual(["ready"]);
    expect(selectBroadcastAgents(agents, true).map(agent => agent.name)).toEqual(["ready", "busy", "idle"]);
  });

  test("routes broadcast HTTP through apiFetch", () => {
    const source = readFileSync(new URL("./FleetGrid.tsx", import.meta.url), "utf8");
    expect(source).toContain('apiFetch("/api/send"');
    expect(source).not.toMatch(/fetch\(apiUrl\("\/api\/send"/);
  });
});

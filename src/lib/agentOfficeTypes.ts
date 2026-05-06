/**
 * Commerce Office agent embed — type contract (mirror).
 *
 * Source of truth: /home/leo/maw-js/src/lib/agent-office-types.ts (FORGE owns).
 * This file mirrors FORGE's contract for maw-ui consumers; if FORGE revises the
 * shape, update both. Keep field names + status enum identical.
 */

export type AgentName = "PULSE" | "MONEY" | "MEMO" | "SCOUT" | "PRINT";

export type AgentOfficeStatus = "active" | "idle" | "blocked";

export type AgentSurfacedFor = "amy" | "leo" | "both";

export interface AgentOfficeRow {
  agent: AgentName;
  activity_summary: string;
  last_run_ts: string | null;
  output_count: number;
  status: AgentOfficeStatus;
  surfaced_for: AgentSurfacedFor;
  is_mock: boolean;
}

export const AGENT_OFFICE_AGENTS: readonly AgentName[] = [
  "PULSE",
  "MONEY",
  "MEMO",
  "SCOUT",
  "PRINT",
] as const;

const SURFACED_FOR_DEFAULT: Record<AgentName, AgentSurfacedFor> = {
  PULSE: "amy",
  MONEY: "amy",
  MEMO: "both",
  SCOUT: "leo",
  PRINT: "amy",
};

export function mockAgentOfficeRow(agent: AgentName): AgentOfficeRow {
  return {
    agent,
    activity_summary: `[MOCK] ${agent} activity not yet wired`,
    last_run_ts: null,
    output_count: 0,
    status: "idle",
    surfaced_for: SURFACED_FOR_DEFAULT[agent],
    is_mock: true,
  };
}

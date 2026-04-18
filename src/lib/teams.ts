import type { Team } from "./cross-team-queue-types";

// Hardcoded team roster for v2.1 — approved by HELM 2026-04-18.
// v2.2 promotion target: ~/david-oracle/ψ/memory/shared/team-roster-v1.yaml
// Must mirror FORGE's backend constant in maw-js; divergence = retro item.
export const TEAM_ROSTER: Record<Exclude<Team, "unknown">, readonly string[]> = {
  software: ["helm", "forge", "vela", "arch", "nexus", "pace", "watchdog", "weaver", "sage"],
  business: ["david", "david-cos", "pulse"],
  cross: ["leo"],
} as const;

export const TEAM_LABELS: Record<Team, string> = {
  software: "Software",
  business: "Business",
  cross: "Cross-Team",
  unknown: "Other",
};

// Ordered for tab rendering — "all" synthesized in UI, not part of Team type.
export const TEAM_TAB_ORDER: ReadonlyArray<"all" | Team> = [
  "all",
  "software",
  "business",
  "cross",
] as const;

export function normalizeOracleName(raw: string): string {
  return raw.trim().toLowerCase().replace(/-oracle$/, "");
}

export function teamOf(oracle: string): Team {
  const name = normalizeOracleName(oracle);
  for (const [team, roster] of Object.entries(TEAM_ROSTER)) {
    if (roster.includes(name)) return team as Team;
  }
  return "unknown";
}

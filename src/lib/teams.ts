import { TEAM_ROSTER, type TeamName } from "./cross-team-queue-types";

// Re-export the canonical TEAM_ROSTER from FORGE's shared contract.
// UI consumers in this repo import from "./teams" rather than reach into the
// schema types file, so helpers (labels, tab order, normalization) co-locate.
export { TEAM_ROSTER };
export type { TeamName };

// UI-facing union: backend `team` field is `TeamName | "unknown"`.
export type Team = TeamName | "unknown";

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

// Backend pre-computes `item.team`; this helper exists for inputs without
// a precomputed team (e.g. fleet agent list) and to mirror FORGE's constant
// exactly. Divergence is a retro item per ADR-002.
export function teamOf(oracle: string): Team {
  const name = normalizeOracleName(oracle);
  for (const [team, roster] of Object.entries(TEAM_ROSTER)) {
    if ((roster as readonly string[]).includes(name)) return team as Team;
  }
  return "unknown";
}

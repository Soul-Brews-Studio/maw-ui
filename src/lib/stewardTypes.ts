/**
 * Steward log row — type contract (mirror).
 *
 * Source of truth: /home/leo/maw-js/src/lib/steward-log-parser.ts (FORGE owns).
 * If FORGE revises the parser shape, update this mirror.
 *
 * Spec: ψ/memory/forge/inbox/2026-05-03_helm-ship-today-forge-backend.md §F2
 */

export type StewardStatus =
  | "active"
  | "stuck-ping"
  | "awaiting-leo"
  | "surfaced-leo"
  | "parked";

export interface StewardRow {
  id: string;
  row_number: number;
  project_name: string;
  received_from: string | null;
  current_owner: string | null;
  status: StewardStatus;
  why: string | null;
  drift_check: string | null;
}

export const STEWARD_STATUS_COLOR: Record<StewardStatus, string> = {
  "active": "#22c55e",
  "stuck-ping": "#f59e0b",
  "awaiting-leo": "#fb923c",
  "surfaced-leo": "#ef4444",
  "parked": "#94a3b8",
};

export const STEWARD_STATUS_LABEL: Record<StewardStatus, string> = {
  "active": "🟢 active",
  "stuck-ping": "🟡 stuck-ping",
  "awaiting-leo": "🟠 awaiting-leo",
  "surfaced-leo": "🔴 surfaced-leo",
  "parked": "⏸ parked",
};

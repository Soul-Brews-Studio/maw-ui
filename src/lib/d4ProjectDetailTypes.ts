/**
 * D4 Project Detail — type contract (mirror).
 *
 * Source of truth: ~/maw-js/src/lib/d4-project-detail.ts (FORGE owns).
 * Spec:
 *   - david-oracle/ψ/writing/proposals/2026-05-03_phase-1-scope-amendment-D4-project-detail-drawer.md
 *   - david-oracle/ops/docs/STEWARD-DETAIL-MARKDOWN-CONTRACT-v0.md
 *
 * Mirror discipline: peer owns the type; reconcile here on parser revision.
 */

export type DetailLogEntry = {
  /** ISO `YYYY-MM-DDTHH:MM:SS+07:00`; `null` when timestamp prefix unparseable. */
  timestamp: string | null;
  actor: string;
  /** Markdown-rendered preserved (bold, links, emoji). Plain text otherwise. */
  event: string;
};

export type ProjectDetailPayload = {
  project_id: string;
  received_from: string | null;
  current_owner: string | null;
  status: string;
  why: string | null;
  drift_check: "in-scope" | null;
  detail: {
    source: string;
    why_matters: string;
    owner_notes: string;
    related_files: string[];
  };
  plan: {
    dod: string;
    eta_active_hr: number | null;
    halt_criteria: string[];
    spec_path: string | null;
  };
  log: DetailLogEntry[];
};

export const DEFAULT_LOG_LIMIT = 10;

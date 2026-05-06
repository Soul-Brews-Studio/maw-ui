/**
 * D1 [Approve] — type contract (mirror).
 *
 * Source of truth: ~/maw-js/src/lib/d1-approve.ts (FORGE owns).
 * Spec: david-oracle/ops/docs/STEWARD-LOG-SCHEMA-v0.md §11 + §14
 *
 * Mirror discipline (per VELA memory pattern_companion):
 *   - FORGE owns the canonical type; this file is a mirror
 *   - Update this mirror the moment FORGE revises the parser shape
 *   - Do NOT diverge UI-side; reconcile here, not in callers
 */

export const APPROVAL_APPROVERS = ["Leo", "Amy", "HELM", "David", "KaijuPM", "WATCHDOG"] as const;
export type ApprovalApprover = (typeof APPROVAL_APPROVERS)[number];

export const APPROVAL_CLIENTS = ["cockpit-ui", "line-bot", "telegram-bot", "cli"] as const;
export type ApprovalClient = (typeof APPROVAL_CLIENTS)[number];

export const APPROVAL_SCHEMA_VERSION = "0.2" as const;
export const EXPECTED_SCHEMA_VERSION = APPROVAL_SCHEMA_VERSION;

export type ApprovalPayload = {
  approver: ApprovalApprover;
  approved_at: string;
  sentinel_path: string;
};

export type ApproveRequest = {
  project_id: string;
  approver: ApprovalApprover;
  client: ApprovalClient;
  note?: string;
};

export type ApproveResult =
  | { status: "approved"; approved_at: string; sentinel_path: string }
  | {
      status: "already_approved_by_you";
      approved_at: string;
      sentinel_path: string;
      original_approver: ApprovalApprover;
    }
  | {
      status: "approver_mismatch";
      approved_at: string;
      sentinel_path: string;
      original_approver: ApprovalApprover;
    }
  | { status: "project_not_found"; project_id: string }
  | { status: "approver_not_allowed"; approver: string; allowed: readonly string[] }
  | { status: "client_not_allowed"; client: string; allowed: readonly string[] }
  | { status: "lock_timeout" };

/**
 * Per-project enrichment on GET /api/kaiju/control-tower payload (post D1 backend deploy).
 * `approval` is `null` when project is not yet approved; populated when sentinel exists.
 * Only emitted for `source === "steward"` projects.
 */
export type ProjectApprovalEnrichment = {
  id: string;
  source: "steward" | "hardcoded";
  approval: ApprovalPayload | null;
};

/**
 * Schema version comparison result per §11.1.
 */
export type SchemaVersionState =
  | { kind: "match" }
  | { kind: "missing" }   // legacy backend, pre-D1 deploy
  | { kind: "patch-mismatch"; got: string; expected: string }
  | { kind: "minor-mismatch"; got: string; expected: string }
  | { kind: "major-mismatch"; got: string; expected: string };

export function compareSchemaVersion(got: unknown): SchemaVersionState {
  if (typeof got !== "string" || got.length === 0) return { kind: "missing" };
  const expected = EXPECTED_SCHEMA_VERSION;
  if (got === expected) return { kind: "match" };
  const [gotMajor, gotMinor] = got.split(".").map((n) => Number.parseInt(n, 10));
  const [expMajor, expMinor] = expected.split(".").map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(gotMajor) || Number.isNaN(expMajor)) return { kind: "patch-mismatch", got, expected };
  if (gotMajor !== expMajor) return { kind: "major-mismatch", got, expected };
  if ((gotMinor || 0) !== (expMinor || 0)) return { kind: "minor-mismatch", got, expected };
  return { kind: "patch-mismatch", got, expected };
}

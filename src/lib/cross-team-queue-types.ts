// Cross-team queue types — mirrors FORGE's backend contract.
// Canonical source: ~/maw-js/src/shared/cross-team-queue.types.ts (after FORGE ADR-002 lands).
// Duplicated here until maw-ui<->maw-js shared-types package exists; divergence is a retro item.

export type Priority = "high" | "medium" | "low";

export type Team = "software" | "business" | "cross" | "unknown";

export interface CrossTeamQueueItem {
  id: string;
  recipient: string;
  sender: string;
  type: string;
  priority: Priority;
  date: string;
  path: string;
  filename: string;
  title: string;
  tags: string[];
  related: string[];
  mtime: number;
  size: number;

  // Requested additions (VELA ask 2026-04-18, pending FORGE incorporation):
  preview?: string;
  actionHint?: string | null;
}

export interface CrossTeamQueueResponse {
  schemaVersion: 1;
  scannedAt: number;
  byRecipient: Record<string, CrossTeamQueueItem[]>;
  items: CrossTeamQueueItem[];
  scannedFileCount: number;
  parseErrorCount: number;
  emptyInboxes: string[];

  // Requested addition (VELA ask 2026-04-18, pending FORGE incorporation):
  parseErrors?: Array<{ path: string; reason: string }>;
}

export interface CrossTeamQueueQuery {
  recipient?: string | string[];
  type?: string | string[];
  minPriority?: Priority;
  sortBy?: "date" | "priority" | "recipient" | "mtime";
  limitPerRecipient?: number;
}

export interface CrossTeamQueueError {
  schemaVersion: 1;
  error: "scan-failed" | "permission-denied" | "internal";
  message: string;
  parseErrors?: Array<{ path: string; reason: string }>;
}

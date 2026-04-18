import { apiUrl } from "./api";
import type { CrossTeamQueueResponse, CrossTeamQueueQuery, CrossTeamQueueItem } from "./cross-team-queue-types";

// Day 3 URL swap complete (2026-04-18) — fetcher consumes the live
// /api/cross-team-queue endpoint only. The Day 1 `?fixture=queue`
// branch and public/fixtures/cross-team-queue.json were removed once
// FORGE's Day 2 scan (maw-js 53cb396) landed; the fixture itself is
// preserved upstream at ~/david-oracle/ψ/memory/forge/writing/
// cross-team-queue-fixture-v1.json (Principle 1).

function serializeQuery(q: CrossTeamQueueQuery | undefined): string {
  if (!q) return "";
  const parts: string[] = [];
  if (q.recipient) parts.push(`recipient=${encodeURIComponent(Array.isArray(q.recipient) ? q.recipient.join(",") : q.recipient)}`);
  if (q.type) parts.push(`type=${encodeURIComponent(Array.isArray(q.type) ? q.type.join(",") : q.type)}`);
  if (q.team) parts.push(`team=${encodeURIComponent(q.team)}`);
  if (q.actionRequired) parts.push(`actionRequired=${q.actionRequired}`);
  if (q.maxAgeHours !== undefined) parts.push(`maxAgeHours=${q.maxAgeHours}`);
  if (q.limit !== undefined) parts.push(`limit=${q.limit}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export async function fetchCrossTeamQueue(query?: CrossTeamQueueQuery): Promise<CrossTeamQueueResponse | null> {
  try {
    const res = await fetch(apiUrl(`/api/cross-team-queue${serializeQuery(query)}`));
    if (!res.ok) return null;
    const data = (await res.json()) as CrossTeamQueueResponse;
    // Defensive — surface schema version mismatch loudly in dev (Principle 2)
    if (data.schemaVersion !== 1) {
      console.warn("[crossTeamQueue] unexpected schemaVersion", data.schemaVersion);
    }
    return data;
  } catch {
    return null;
  }
}

// Backend pre-computes `item.ageHours`; prefer that for items. This helper
// is for computing age from `scannedAt` (ISO-8601 string) or raw mtime.
export function hoursSinceISO(iso: string, now: number = Date.now()): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, (now - then) / (1000 * 60 * 60));
}

export function hoursSinceMtime(mtime: number, now: number = Date.now()): number {
  return Math.max(0, (now - mtime) / (1000 * 60 * 60));
}

export function itemAgeHours(item: Pick<CrossTeamQueueItem, "ageHours" | "mtime">): number {
  if (typeof item.ageHours === "number" && item.ageHours > 0) return item.ageHours;
  return hoursSinceMtime(item.mtime);
}

export function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Age band drives color dot + aria-label text. Paired with visible label per Rule #2 (not color-only).
export type AgeBand = "fresh" | "active" | "stale" | "old";

export function ageBand(hours: number): AgeBand {
  if (hours < 1) return "fresh";
  if (hours < 12) return "active";
  if (hours < 48) return "stale";
  return "old";
}

export const AGE_BAND_STYLE: Record<AgeBand, { color: string; srLabel: string }> = {
  fresh: { color: "#22c55e", srLabel: "fresh" },
  active: { color: "#fbbf24", srLabel: "within 12 hours" },
  stale: { color: "#f97316", srLabel: "over 12 hours old" },
  old: { color: "#ef4444", srLabel: "over 2 days old — stale" },
};

export const PRIORITY_STYLE: Record<"high" | "medium" | "low", { color: string; label: string }> = {
  high: { color: "#ef4444", label: "High" },
  medium: { color: "#fbbf24", label: "Medium" },
  low: { color: "#94a3b8", label: "Low" },
};

// localStorage-backed read-state. Device-local for v2.1; v2.2 promotion to /api/ui-state sync.
const READ_STATE_KEY = "maw-ui.queue-read-state";

export function loadReadState(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(READ_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function markRead(ids: string[]): void {
  if (typeof localStorage === "undefined" || ids.length === 0) return;
  try {
    const state = loadReadState();
    const now = Date.now();
    for (const id of ids) state[id] = now;
    localStorage.setItem(READ_STATE_KEY, JSON.stringify(state));
  } catch {}
}

export function isUnread(id: string, mtime: number, readState: Record<string, number>): boolean {
  const lastReadAt = readState[id];
  if (!lastReadAt) return true;
  return mtime > lastReadAt;
}

// Re-export the item type so importers can pull everything from this module.
export type { CrossTeamQueueItem, CrossTeamQueueResponse, CrossTeamQueueQuery };

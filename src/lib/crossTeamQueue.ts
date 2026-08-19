import { apiFetch } from "./api";

export type QueueTeam = "software" | "business" | "cross" | "unknown";
export type CrossTeamQueueItem = {
  id: string; path: string; from: string; to: string; type: string;
  title: string; preview: string; actionHint: string | null;
  priority: "high" | "medium" | "low"; ageHours: number; team: QueueTeam;
};
export type CrossTeamQueueResponse = {
  scannedAt: string; items: CrossTeamQueueItem[];
  errors: { path: string; reason: string }[];
};

export async function fetchCrossTeamQueue(): Promise<CrossTeamQueueResponse | null> {
  try {
    const response = await apiFetch("/api/cross-team-queue");
    return response.ok ? response.json() : null;
  } catch { return null; }
}

export function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

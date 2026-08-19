export interface DigestResult {
  windowLabel: string;
  source: string;
  llm: string;
  totalMessages: number;
  agents: string[];
  summary: string;
  conversations: Array<{ pair: string; count: number; summary: string }>;
  blocked: string[];
  pendingDone: string[];
  attention: string[];
  costs: Array<{ name: string; cost: number; tokens: number }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export function parseDigest(value: unknown): DigestResult | null {
  if (!isRecord(value)) return null;
  const conversations = value.conversations;
  const costs = value.costs;
  if (
    typeof value.windowLabel !== "string" ||
    typeof value.source !== "string" ||
    typeof value.llm !== "string" ||
    typeof value.totalMessages !== "number" ||
    !Number.isFinite(value.totalMessages) ||
    !isStringArray(value.agents) ||
    typeof value.summary !== "string" ||
    !isStringArray(value.blocked) ||
    !isStringArray(value.pendingDone) ||
    !isStringArray(value.attention) ||
    !Array.isArray(conversations) ||
    !conversations.every((item) =>
      isRecord(item) &&
      typeof item.pair === "string" &&
      typeof item.count === "number" &&
      Number.isFinite(item.count) &&
      typeof item.summary === "string"
    ) ||
    !Array.isArray(costs) ||
    !costs.every((item) =>
      isRecord(item) &&
      typeof item.name === "string" &&
      typeof item.cost === "number" &&
      Number.isFinite(item.cost) &&
      typeof item.tokens === "number" &&
      Number.isFinite(item.tokens)
    )
  ) return null;
  return value as unknown as DigestResult;
}

export async function fetchDigest(): Promise<DigestResult | null> {
  const response = await apiFetch("/api/digest");
  return response.ok ? parseDigest(await response.json()) : null;
}
import { apiFetch } from "./api";

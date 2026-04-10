import type { FeedEventType } from "../../lib/feed";

export interface AgentNode {
  id: string;
  node: string; // machine
  x: number;
  y: number;
  vx: number;
  vy: number;
  syncPeers: string[];
  buddedFrom?: string;
  children: string[];
}

export interface AgentEdge {
  source: string;
  target: string;
  type: "sync" | "lineage" | "message";
  count: number;
}

export interface Particle {
  phase: number;
  speed: number;
}

export const BUSY_EVENTS = new Set<FeedEventType>([
  "PreToolUse", "PostToolUse", "UserPromptSubmit", "SubagentStart",
  "PostToolUseFailure", "PluginHook", "PluginFilter", "PluginLoad",
]);

export const STOP_EVENTS = new Set<FeedEventType>(["Stop", "SessionEnd", "Notification"]);

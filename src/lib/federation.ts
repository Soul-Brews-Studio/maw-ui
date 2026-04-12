/**
 * Federation types and node color system.
 * Maps to API endpoints from maw-js#10 (federation backend).
 */

// ── Types ──────────────────────────────────────────────────

export interface FederationConfig {
  node: string;
  agents: Record<string, string>; // agentName → nodeName ("local" means the current node)
  namedPeers: Array<{ name: string; url: string }>; // matches maw-js shape (array, not Record)
}

export interface PeerStatus {
  name: string;
  url: string;
  reachable: boolean;
  latencyMs: number | null;
}

export interface FederationStatus {
  peers: PeerStatus[];
}

export interface FederatedAgent {
  name: string;
  node: string;
  isLocal: boolean;
}

// ── Node Colors ────────────────────────────────────────────

const NODE_COLORS: Record<string, { accent: string; bg: string; label: string }> = {
  vuttiserver: { accent: "#64b5f6", bg: "#141a28", label: "Vutti" },
  curfew:      { accent: "#66bb6a", bg: "#142818", label: "Curfew" },
};

const FALLBACK_NODE_COLORS = [
  { accent: "#ffa726", bg: "#281e14" },
  { accent: "#ab47bc", bg: "#1e1428" },
  { accent: "#ef5350", bg: "#281418" },
  { accent: "#26c6da", bg: "#1a2228" },
  { accent: "#ec407a", bg: "#281420" },
];

export function nodeColor(nodeName: string | undefined | null): { accent: string; bg: string; label: string } {
  // Defense in depth: graceful fallback when upstream passes undefined/empty
  // (e.g. peer.name when the API doesn't include a name field). Prevents the
  // whole view from crashing on bad peer data.
  if (!nodeName || typeof nodeName !== "string") {
    return { accent: "#888888", bg: "#1a1a1a", label: "?" };
  }
  if (NODE_COLORS[nodeName]) return NODE_COLORS[nodeName];
  let h = 0;
  for (let i = 0; i < nodeName.length; i++) h = ((h << 5) - h + nodeName.charCodeAt(i)) | 0;
  const fb = FALLBACK_NODE_COLORS[Math.abs(h) % FALLBACK_NODE_COLORS.length];
  const label = nodeName.charAt(0).toUpperCase() + nodeName.slice(1);
  return { ...fb, label };
}

// ── Helpers ────────────────────────────────────────────────

/** Format cross-node target: "curfew:echo-oracle" */
export function crossNodeTarget(node: string, agent: string, localNode: string): string {
  if (node === localNode) return agent;
  return `${node}:${agent}`;
}

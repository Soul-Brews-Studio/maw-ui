import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "../lib/api";
import type {
  FederationConfig,
  FederationStatus,
  FederatedAgent,
} from "../lib/federation";

interface UseFederationList {
  /** Current node name (null until loaded) */
  localNode: string | null;
  /** All agents across all nodes */
  agents: FederatedAgent[];
  /** Peer reachability status */
  peers: FederationStatus["peers"];
  /** Whether federation data is loading */
  loading: boolean;
  /** Whether federation is available (API responded) */
  available: boolean;
  /** Re-fetch all federation data */
  refresh: () => void;
}

const POLL_INTERVAL = 30_000; // refresh peer status every 30s

export function useFederationList(): UseFederationList {
  const [config, setConfig] = useState<FederationConfig | null>(null);
  const [peers, setPeers] = useState<FederationStatus["peers"]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);

  // Ref so the polling fetchStatus can read fresh namedPeers without
  // re-creating the callback (which would re-arm the setInterval).
  const namedPeersRef = useRef<Array<{ name: string; url: string }>>([]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/config"));
      if (!res.ok) throw new Error(`${res.status}`);
      const data: FederationConfig = await res.json();
      if (data.node && data.agents) {
        setConfig(data);
        namedPeersRef.current = Array.isArray(data.namedPeers) ? data.namedPeers : [];
        setAvailable(true);
      }
    } catch {
      // Federation API not available yet (#10 not deployed)
      setAvailable(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/federation/status"));
      if (!res.ok) return;
      // Real maw-js shape: { peers: [{ url, reachable, latency }] }
      // PR's PeerStatus type:        [{ name, url, reachable, latencyMs }]
      // Bridge the gap here so consumers see the typed shape.
      const data = (await res.json()) as {
        peers?: Array<{ url: string; reachable: boolean; latency?: number }>;
      };
      const named = namedPeersRef.current;
      const mapped: FederationStatus["peers"] = (data.peers ?? []).map((p) => {
        const match = named.find((np) => np.url === p.url);
        return {
          name: match?.name ?? p.url.replace(/^https?:\/\//, ""),
          url: p.url,
          reachable: p.reachable,
          latencyMs: typeof p.latency === "number" ? p.latency : null,
        };
      });
      setPeers(mapped);
    } catch {
      // Silently fail — status is optional
    }
  }, []);

  const refresh = useCallback(() => {
    fetchConfig();
    fetchStatus();
  }, [fetchConfig, fetchStatus]);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchConfig();
      await fetchStatus();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchConfig, fetchStatus]);

  // Poll peer status
  useEffect(() => {
    if (!available) return;
    const id = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [available, fetchStatus]);

  // Derive agent list from config. The maw-js convention is that
  // `agents` values can be the literal string "local" to mean "the current
  // node" — normalize that to config.node so cross-node grouping works.
  const agents: FederatedAgent[] = config
    ? Object.entries(config.agents).map(([name, rawNode]) => {
        const node = rawNode === "local" ? config.node : rawNode;
        return {
          name,
          node,
          isLocal: node === config.node,
        };
      })
    : [];

  return {
    localNode: config?.node ?? null,
    agents,
    peers,
    loading,
    available,
    refresh,
  };
}

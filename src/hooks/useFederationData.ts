import { useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useMqtt } from "./useMqtt";
import { apiUrl } from "../lib/api";
import { useFederationStore } from "../components/federation/store";
import { simulate } from "../components/federation/simulation";
import type { AgentNode, AgentEdge, Particle } from "../components/federation/types";
import type { FeedEvent } from "../lib/feed";

export function useFederationData() {
  const { setGraph, setPlugins, setMessageLog, handleFeedEvent, handleFeedHistory, handleLiveMessage } = useFederationStore();

  const handleMessage = useCallback((data: any) => {
    if (data.type === "feed") {
      const e = data.event as FeedEvent;
      handleFeedEvent(e);

      // MessageSend: oracle = sender node, message = "{target}: {body}"
      if (e.event === "MessageSend" && e.message) {
        const colonIdx = e.message.indexOf(": ");
        if (colonIdx > 0) {
          const to = e.message.slice(0, colonIdx).replace(/^.*:/, "").replace(/-oracle$/, "");
          const from = e.oracle.replace(/-oracle$/, "");
          if (from && to) handleLiveMessage(from, to);
        }
      }

      // Also catch relay messages: [node:oracle] → body
      if (e.event === "UserPromptSubmit" && e.message) {
        const relay = e.message.match(/^\[([^\]]+)\]\s*[→>]\s*/);
        if (relay) {
          const from = relay[1].replace(/^.*:/, "").replace(/-oracle$/, "");
          const to = e.oracle.replace(/-oracle$/, "");
          if (from && to && from !== to) handleLiveMessage(from, to);
        }
      }
    } else if (data.type === "feed-history") {
      handleFeedHistory(data.events as FeedEvent[]);
    } else if (data.type === "message") {
      // Direct maw hey message event from WebSocket
      const from = data.from?.replace(/^.*:/, "").replace(/-oracle$/, "") || "";
      const to = data.to?.replace(/^.*:/, "").replace(/-oracle$/, "") || "";
      if (from && to) handleLiveMessage(from, to);
    }
  }, [handleFeedEvent, handleFeedHistory, handleLiveMessage]);

  const { connected } = useWebSocket(handleMessage);

  // MQTT subscription for cross-federation maw hey messages
  const handleMqttMessage = useCallback((msg: { from: string; to: string }) => {
    const from = msg.from.replace(/-oracle$/, "");
    const to = msg.to.replace(/-oracle$/, "");
    if (from && to) handleLiveMessage(from, to);
  }, [handleLiveMessage]);

  const { connected: mqttConnected } = useMqtt(handleMqttMessage);

  useEffect(() => {
    async function load() {
      // Canonical v1 endpoints — see ψ/memory/feedback_ground_before_proposing.md
      // for the drift incident that locked this mapping.
      //   /api/config            — agents map + namedPeers + node identity
      //   /api/fleet-config      — fleet entries with sync_peers + budded_from
      //   /api/feed?limit=200    — live event log (replaces the old /api/messages)
      //   /api/plugins           — optional, may 404 on stale pm2 (graceful degrade)
      const [config, fleetConfig, feed, pluginData] = await Promise.all([
        fetch(apiUrl("/api/config")).then(r => r.json()).catch(() => null),
        fetch(apiUrl("/api/fleet-config")).then(r => r.json()).catch(() => null),
        fetch(apiUrl("/api/feed?limit=200")).then(r => r.json()).catch(() => null),
        fetch(apiUrl("/api/plugins")).then(r => r.json()).catch(() => null),
      ]);

      if (pluginData?.plugins) setPlugins(pluginData.plugins);

      // Load message history for the live panel — derived from MessageSend feed events.
      // Feed event message shape: "{target}: {body}", oracle = sender.
      if (feed?.events) {
        const clean = (s: string) => (s || "").replace(/^.*:/, "").replace(/-oracle$/, "").replace(/-view$/, "");
        const log = feed.events
          .filter((e: any) => e.event === "MessageSend" && e.message)
          .map((e: any) => {
            const colonIdx = e.message.indexOf(": ");
            const toRaw = colonIdx > 0 ? e.message.slice(0, colonIdx) : "";
            const body = colonIdx > 0 ? e.message.slice(colonIdx + 2) : e.message;
            return {
              from: clean(e.oracle),
              to: clean(toRaw),
              msg: body.slice(0, 120),
              ts: e.ts,
            };
          })
          .filter((m: any) => m.from && m.to)
          .reverse(); // newest first
        setMessageLog(log);
      }

      // Agent -> machine map
      const a2m: Record<string, string> = {};
      if (config?.agents) for (const [a, m] of Object.entries(config.agents)) a2m[a] = m as string;

      // Fleet data -> sync_peers, lineage. /api/fleet-config returns {configs: [...]}.
      // budded_from is per-entry; children are computed by inverting client-side
      // (the new endpoint does not carry a children field — confirmed with mawjs-oracle).
      const fleetMap: Record<string, { syncPeers: string[]; buddedFrom?: string; children: string[] }> = {};
      if (fleetConfig?.configs) {
        for (const f of fleetConfig.configs) {
          const name = f.windows?.[0]?.name?.replace(/-oracle$/, "") || f.name.replace(/^\d+-/, "");
          fleetMap[name] = {
            syncPeers: (f.sync_peers || []).filter((p: string) => p !== "--help"),
            buddedFrom: f.budded_from || undefined,
            children: [],
          };
        }
        // Invert budded_from -> children
        for (const [child, entry] of Object.entries(fleetMap)) {
          if (entry.buddedFrom && fleetMap[entry.buddedFrom]) {
            fleetMap[entry.buddedFrom].children.push(child);
          }
        }
      }

      // Build agent nodes
      const W = (window.innerWidth - 240) || 900;
      const H = (window.innerHeight - 52) || 600;
      const agentList: AgentNode[] = [];
      const seen = new Set<string>();

      for (const [name, machine] of Object.entries(a2m)) {
        if (seen.has(name)) continue;
        seen.add(name);
        const fm = fleetMap[name];
        agentList.push({
          id: name, node: machine,
          x: 0, y: 0, vx: 0, vy: 0,
          syncPeers: fm?.syncPeers || [],
          buddedFrom: fm?.buddedFrom,
          children: fm?.children || [],
        });
      }

      // Build edges
      const edgeSet = new Set<string>();
      const edgeList: AgentEdge[] = [];

      function addEdge(src: string, tgt: string, type: AgentEdge["type"], count = 1) {
        const key = `${type}:${[src, tgt].sort().join("-")}`;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        edgeList.push({ source: src, target: tgt, type, count });
      }

      // Sync peer edges
      for (const agent of agentList) {
        for (const peer of agent.syncPeers) {
          if (seen.has(peer)) addEdge(agent.id, peer, "sync");
        }
      }

      // Lineage edges
      for (const agent of agentList) {
        if (agent.buddedFrom && seen.has(agent.buddedFrom)) addEdge(agent.buddedFrom, agent.id, "lineage");
        for (const child of agent.children) {
          if (seen.has(child)) addEdge(agent.id, child, "lineage");
        }
      }

      // Message edges — derived from /api/feed MessageSend events.
      // Same data as the old /api/messages, different shape.
      if (feed?.events) {
        const msgCounts: Record<string, number> = {};
        for (const e of feed.events) {
          if (e.event !== "MessageSend" || !e.message) continue;
          const colonIdx = e.message.indexOf(": ");
          if (colonIdx <= 0) continue;
          const from = e.oracle?.replace(/^.*:/, "").replace(/-oracle$/, "") || "";
          const to = e.message.slice(0, colonIdx).replace(/^.*:/, "").replace(/-oracle$/, "");
          if (from && to && seen.has(from) && seen.has(to) && from !== to) {
            const key = [from, to].sort().join("-");
            msgCounts[key] = (msgCounts[key] || 0) + 1;
          }
        }
        for (const [key, count] of Object.entries(msgCounts)) {
          const [a, b] = key.split("-");
          addEdge(a, b, "message", count);
        }
      }

      // Initialize particles for message edges
      const newParticles = new Map<string, Particle[]>();
      for (const edge of edgeList) {
        if (edge.type === "message" || edge.type === "sync") {
          const key = `${edge.source}-${edge.target}`;
          const n = edge.type === "message" ? Math.min(6, edge.count + 1) : 1;
          newParticles.set(key, Array.from({ length: n }, () => ({
            phase: Math.random(),
            speed: 0.0002 + Math.random() * 0.0003,
          })));
        }
      }

      // Run force simulation
      simulate(agentList, edgeList, W, H);

      setGraph(agentList, edgeList, newParticles);
    }

    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [setGraph]);

  return { connected, mqttConnected };
}

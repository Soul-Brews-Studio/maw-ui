import { useState, useEffect, useMemo, useRef } from "react";
import { type MawLogEntry, formatDate, pairKey } from "./types";
import { apiUrl, wsUrl } from "../../lib/api";

// /api/feed event shape — public federation API v1 (maw-js src/api/feed.ts).
// Chat view consumes this since /api/maw-log was rotated to 410 Gone
// (FORGE maw-js fb9f599, 2026-04-18) with successor /api/feed.
interface FeedEvent {
  timestamp: string;
  oracle: string;
  host: string;
  event: string;
  project: string;
  sessionId: string;
  message: string;
  ts: number;
}

// Parse "recipient: body" prefix from feed message text.
// Returns [to, msg] on match, or [null, original] when no prefix.
// Heuristic: take first colon if followed by space, recipient ≤ 40 chars,
// no whitespace in recipient. Tolerant — failed parses drop the event
// (same filter the old /api/maw-log consumer applied: require from && to).
function parseRecipient(message: string): [string | null, string] {
  const m = message.match(/^([a-z0-9_-]{1,40}):\s+(.+)$/is);
  if (!m) return [null, message];
  return [m[1].toLowerCase(), m[2]];
}

function feedEventToLogEntry(e: FeedEvent): MawLogEntry | null {
  if (e.event !== "MessageSend") return null;
  const [to, msg] = parseRecipient(e.message);
  if (!to) return null;
  return { ts: e.timestamp, from: e.oracle, to, msg };
}

export function useChatLog(mode: string) {
  const [entries, setEntries] = useState<MawLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial fetch — /api/feed?limit=200 (server caps at 200 per feed.ts:21).
  // Lens-2 discrimination: 410 Gone from a deprecated-route caller surfaces
  // visibly via sourceError, not as silent empty entries. See
  // ~/david-oracle/ψ/memory/vela/patterns/2026-04-18_silent-errors-deprecated-endpoints.md
  useEffect(() => {
    setLoading(true);
    setSourceError(null);
    fetch(apiUrl("/api/feed?limit=200"))
      .then(async (r) => {
        if (r.status === 410) {
          const body = await r.json().catch(() => ({}));
          setSourceError(`chat source deprecated (410 Gone). replacement: ${body?.replacement ?? "unknown"}`);
          setLoading(false);
          return null;
        }
        if (!r.ok) {
          setSourceError(`chat source unreachable (HTTP ${r.status})`);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const mapped: MawLogEntry[] = (data.events ?? [])
          .map(feedEventToLogEntry)
          .filter((e: MawLogEntry | null): e is MawLogEntry => e !== null);
        setEntries(mapped);
        setTotal(mapped.length);
        setLoading(false);
      })
      .catch((err) => {
        setSourceError(`chat source fetch failed: ${err?.message ?? "network error"}`);
        setLoading(false);
      });
  }, []);

  // Real-time: listen for WebSocket push. Handles both "maw-log" (legacy payload
  // type, retained for back-compat — no matches in current maw-js src but cheap
  // to keep per Principle 1 "Nothing is Deleted") and "feed" (the new type
  // emitted alongside FORGE's 410 rotation, if/when server pushes per-event).
  useEffect(() => {
    const url = wsUrl("/ws");
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          let incoming: MawLogEntry[] = [];
          if (msg.type === "maw-log" && msg.entries) {
            incoming = msg.entries;
          } else if (msg.type === "feed" && Array.isArray(msg.events)) {
            incoming = msg.events
              .map(feedEventToLogEntry)
              .filter((e: MawLogEntry | null): e is MawLogEntry => e !== null);
          }
          if (incoming.length > 0) {
            setEntries(prev => [...prev, ...incoming]);
            setTotal(prev => prev + incoming.length);
            if (mode === "live") {
              requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
              });
            }
          }
        } catch {}
      };
    } catch {}
    return () => { ws?.close(); };
  }, [mode]);

  return { entries, total, loading, sourceError, scrollRef };
}

export function useOracleNames(entries: MawLogEntry[]) {
  return useMemo(() => {
    const names = new Set<string>();
    for (const e of entries) {
      names.add(e.from);
      names.add(e.to);
    }
    names.delete("unknown");
    return [...names].sort();
  }, [entries]);
}

export function useFilteredEntries(entries: MawLogEntry[], filter: string) {
  return useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.from === filter || e.to === filter);
  }, [entries, filter]);
}

/** Timeline: newest first, grouped by consecutive sender, with date separators */
export function useTimelineGroups(filtered: MawLogEntry[]) {
  return useMemo(() => {
    const reversed = [...filtered].reverse();
    const result: { date: string | null; entries: MawLogEntry[] }[] = [];
    let lastDate = "";
    let lastFrom = "";
    for (const entry of reversed) {
      const date = formatDate(entry.ts);
      const isNewDate = date !== lastDate;
      const isNewSender = entry.from !== lastFrom || isNewDate;
      if (isNewSender) {
        result.push({ date: isNewDate ? date : null, entries: [entry] });
      } else {
        result[result.length - 1].entries.push(entry);
      }
      lastDate = date;
      lastFrom = entry.from;
    }
    return result;
  }, [filtered]);
}

/** Live: newest at bottom, grouped by consecutive sender */
export function useLiveGroups(filtered: MawLogEntry[]) {
  return useMemo(() => {
    const result: { entries: MawLogEntry[] }[] = [];
    let lastFrom = "";
    for (const entry of filtered) {
      if (entry.from !== lastFrom) {
        result.push({ entries: [entry] });
      } else {
        result[result.length - 1].entries.push(entry);
      }
      lastFrom = entry.from;
    }
    return result;
  }, [filtered]);
}

/** Estimate tokens from text — Thai ~1.5 chars/token, English ~4, mixed ~2.5 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count Thai chars vs ASCII
  let thai = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x0e00) thai++;
  }
  const ratio = text.length > 0 ? thai / text.length : 0;
  // Thai-heavy → ~1.5 chars/token, English-heavy → ~4 chars/token
  const charsPerToken = 1.5 + (1 - ratio) * 2.5;
  return Math.round(text.length / charsPerToken);
}

export interface TokenStats {
  totalTokens: number;
  tokensPerMin: number;
  byOracle: { name: string; tokens: number }[];
  spanMinutes: number;
}

/** Calculate token stats from entries */
export function useTokenStats(entries: MawLogEntry[]): TokenStats {
  return useMemo(() => {
    if (entries.length === 0) return { totalTokens: 0, tokensPerMin: 0, byOracle: [], spanMinutes: 0 };

    const byOracle = new Map<string, number>();
    let totalTokens = 0;

    for (const e of entries) {
      const t = estimateTokens(e.msg);
      totalTokens += t;
      byOracle.set(e.from, (byOracle.get(e.from) || 0) + t);
    }

    const times = entries.map(e => new Date(e.ts).getTime()).filter(t => !isNaN(t));
    const spanMs = times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0;
    const spanMinutes = Math.max(spanMs / 60000, 1);
    const tokensPerMin = totalTokens / spanMinutes;

    const sorted = [...byOracle.entries()]
      .map(([name, tokens]) => ({ name, tokens }))
      .sort((a, b) => b.tokens - a.tokens);

    return { totalTokens, tokensPerMin, byOracle: sorted, spanMinutes };
  }, [entries]);
}

/** Threads: grouped by pair, newest thread first */
export function useThreads(filtered: MawLogEntry[]) {
  return useMemo(() => {
    const map = new Map<string, MawLogEntry[]>();
    for (const e of filtered) {
      const key = pairKey(e.from, e.to);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()].sort((a, b) => {
      return b[1][b[1].length - 1].ts.localeCompare(a[1][a[1].length - 1].ts);
    });
  }, [filtered]);
}

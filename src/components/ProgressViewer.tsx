import { memo, useMemo, useRef, useEffect, useState, useCallback } from "react";
import { agentColor } from "../lib/constants";
import { describeActivity, type FeedEvent } from "../lib/feed";
import { AgentAvatar } from "./AgentAvatar";

const EVENT_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  PreToolUse: { icon: "🔧", label: "Tool call", color: "#fbbf24" },
  PostToolUse: { icon: "✅", label: "Tool done", color: "#22c55e" },
  PostToolUseFailure: { icon: "❌", label: "Tool failed", color: "#ef4444" },
  UserPromptSubmit: { icon: "💬", label: "User input", color: "#60a5fa" },
  Stop: { icon: "⏸", label: "Waiting", color: "#94a3b8" },
  SessionEnd: { icon: "🏁", label: "Session ended", color: "#64748b" },
  SubagentStart: { icon: "🚀", label: "Subagent", color: "#c084fc" },
  TaskCompleted: { icon: "🎯", label: "Task done", color: "#22c55e" },
  Notification: { icon: "🔔", label: "Notification", color: "#fb923c" },
  Error: { icon: "💥", label: "Error", color: "#ef4444" },
};

function formatTime(ts: number | string): string {
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

interface OracleGroup {
  oracle: string;
  events: FeedEvent[];
  lastActive: number;
  currentActivity: string;
}

const EventRow = memo(function EventRow({ event }: { event: FeedEvent }) {
  const config = EVENT_LABELS[event.event] || { icon: "📋", label: event.event, color: "#94a3b8" };
  const message = event.message?.slice(0, 120) || describeActivity(event);

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-white/[0.02]">
      <span className="text-sm mt-0.5 shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold" style={{ color: config.color }}>{config.label}</span>
          <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{formatTime(event.timestamp || event.ts)}</span>
        </div>
        {message && (
          <p className="font-mono text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{message}</p>
        )}
      </div>
    </div>
  );
});

const OracleTimeline = memo(function OracleTimeline({
  group,
  expanded,
  onToggle,
}: {
  group: OracleGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = agentColor(group.oracle + "-oracle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(group.events.length);

  // Auto-scroll when new events arrive (only if already near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !expanded) return;
    if (group.events.length > prevCountRef.current) {
      // Events are newest-first, so scroll to top for latest
      el.scrollTop = 0;
    }
    prevCountRef.current = group.events.length;
  }, [group.events.length, expanded]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header — clickable to expand/collapse */}
      <div
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 cursor-pointer select-none transition-colors hover:bg-white/[0.03] min-h-[52px]"
        style={{ borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none" }}
        onClick={onToggle}
      >
        <AgentAvatar name={group.oracle + "-oracle"} size={36} />
        <div className="flex-1">
          <h3 className="font-mono font-bold" style={{ color }}>{group.oracle}</h3>
          <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            {group.currentActivity} · {timeAgo(group.lastActive)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{group.events.length} events</span>
          <span
            className="text-xs transition-transform duration-200"
            style={{ color: "rgba(255,255,255,0.3)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Timeline — collapsible */}
      {expanded && (
        <div ref={scrollRef} className="px-2 py-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {group.events.map((event, i) => (
            <EventRow key={`${event.ts}-${i}`} event={event} />
          ))}
        </div>
      )}
    </div>
  );
});

export function ProgressViewer({ feedEvents }: { feedEvents: FeedEvent[] }) {
  const [expandedOracles, setExpandedOracles] = useState<Set<string>>(new Set());

  const toggleOracle = useCallback((oracle: string) => {
    setExpandedOracles((prev) => {
      const next = new Set(prev);
      if (next.has(oracle)) next.delete(oracle);
      else next.add(oracle);
      return next;
    });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const e of feedEvents) {
      const arr = map.get(e.oracle) || [];
      arr.push(e);
      map.set(e.oracle, arr);
    }

    const result: OracleGroup[] = [];
    for (const [oracle, events] of map) {
      const sorted = [...events].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const last = sorted[0];
      result.push({
        oracle,
        events: sorted.slice(0, 30),
        lastActive: last?.ts || 0,
        currentActivity: describeActivity(last),
      });
    }

    return result.sort((a, b) => b.lastActive - a.lastActive);
  }, [feedEvents]);

  // Auto-expand the most recently active oracle
  useEffect(() => {
    if (groups.length > 0 && expandedOracles.size === 0) {
      setExpandedOracles(new Set([groups[0].oracle]));
    }
  }, [groups.length > 0]); // only on first non-empty render

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>No activity yet</p>
          <p className="font-mono text-xs mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>Feed events will appear here as agents work</p>
        </div>
      </div>
    );
  }

  const allExpanded = groups.every((g) => expandedOracles.has(g.oracle));

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono" style={{ color: "#e2e8f0" }}>Progress</h1>
          <p className="font-mono text-[10px] sm:text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {groups.length} oracle{groups.length !== 1 ? "s" : ""} · {feedEvents.length} events
          </p>
        </div>
        <button
          className="font-mono text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06] min-h-[44px] sm:min-h-0"
          style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
          onClick={() => {
            if (allExpanded) setExpandedOracles(new Set());
            else setExpandedOracles(new Set(groups.map((g) => g.oracle)));
          }}
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {groups.map((group) => (
          <OracleTimeline
            key={group.oracle}
            group={group}
            expanded={expandedOracles.has(group.oracle)}
            onToggle={() => toggleOracle(group.oracle)}
          />
        ))}
      </div>
    </div>
  );
}

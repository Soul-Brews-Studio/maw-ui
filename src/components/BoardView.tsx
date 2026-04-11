import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { useFleetStore } from "../lib/store";
import type { BoardItem, BoardField, ScanResult, ScanMineResult, TimelineItem, AgentState, PulseBoard } from "../lib/types";
import { TaskDetailOverlay } from "./TaskDetailOverlay";
import { ProjectBoardView } from "./ProjectBoardView";

interface BoardViewProps {
  connected: boolean;
  send: (msg: Record<string, unknown>) => void;
  agents: AgentState[];
}

/** Map oracle field value → live agent status */
function useOracleStatusMap(agents: AgentState[]): Map<string, "busy" | "ready" | "idle"> {
  return useMemo(() => {
    const m = new Map<string, "busy" | "ready" | "idle">();
    for (const a of agents) {
      // oracle names in board: "dev", "qa", "researcher", etc.
      // agent names in tmux: "dev-oracle", "researcher-oracle", or "dev-projectname"
      const oracleName = a.name.replace(/-[Oo]racle$/, "").replace(/-.*$/, "");
      const existing = m.get(oracleName);
      // Keep the most active status
      if (!existing || a.status === "busy" || (a.status === "ready" && existing === "idle")) {
        m.set(oracleName, a.status);
      }
    }
    return m;
  }, [agents]);
}

// --- Priority colors ---
const PRIORITY_COLORS: Record<string, string> = {
  P0: "#ef4444",
  P1: "#f97316",
  P2: "#eab308",
  P3: "#22d3ee",
  P4: "#6b7280",
};

const STATUS_COLORS: Record<string, string> = {
  "Done": "#22c55e",
  "In Progress": "#eab308",
  "Todo": "#6b7280",
  "Backlog": "#4b5563",
};

// --- Toolbar ---

function Toolbar({ send }: { send: BoardViewProps["send"] }) {
  const [addText, setAddText] = useState("");
  const filter = useFleetStore((s) => s.boardFilter);
  const setBoardFilter = useFleetStore((s) => s.setBoardFilter);
  const subView = useFleetStore((s) => s.boardSubView);
  const setBoardSubView = useFleetStore((s) => s.setBoardSubView);
  const loading = useFleetStore((s) => s.boardLoading);
  const setBoardLoading = useFleetStore((s) => s.setBoardLoading);

  const refresh = useCallback(() => {
    setBoardLoading(true);
    send({ type: "board", filter: filter || undefined });
  }, [send, filter, setBoardLoading]);

  const onAdd = useCallback(() => {
    const title = addText.trim();
    if (!title) return;
    send({ type: "board-add", title });
    setAddText("");
  }, [addText, send]);

  const onAutoAssign = useCallback(() => {
    send({ type: "board-auto-assign" });
  }, [send]);

  const tabs = [
    { id: "board" as const, label: "Board" },
    { id: "projects" as const, label: "Projects" },
    { id: "pulse" as const, label: "Pulse" },
    { id: "timeline" as const, label: "Timeline" },
    { id: "scan" as const, label: "Scan" },
    { id: "activity" as const, label: "Activity" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-2 sm:py-3">
      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setBoardSubView(tab.id);
              if (tab.id === "projects") { send({ type: "project-board" }); send({ type: "task-log-summaries" }); }
              if (tab.id === "scan") send({ type: "board-scan" });
              if (tab.id === "activity") send({ type: "board-scan-mine" });
              if (tab.id === "timeline") send({ type: "board-timeline", filter: filter || undefined });
              if (tab.id === "pulse") send({ type: "pulse-board" });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              subView === tab.id
                ? "bg-cyan-500/20 text-cyan-400"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter..."
        value={filter}
        onChange={(e) => setBoardFilter(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && refresh()}
        className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/30 outline-none focus:border-cyan-500/40 w-40"
      />

      {/* Add task */}
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="+ Add task..."
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/30 outline-none focus:border-cyan-500/40 w-48"
        />
        {addText.trim() && (
          <button
            onClick={onAdd}
            className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-all"
          >
            Add
          </button>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={onAutoAssign}
        className="px-3 py-1.5 bg-purple-500/15 text-purple-400 border border-purple-500/25 rounded-lg text-xs font-medium hover:bg-purple-500/25 transition-all"
      >
        Auto-assign
      </button>

      <button
        onClick={refresh}
        disabled={loading}
        className="px-3 py-1.5 bg-white/[0.06] text-white/60 border border-white/10 rounded-lg text-xs font-medium hover:bg-white/10 transition-all disabled:opacity-40"
      >
        {loading ? "..." : "Refresh"}
      </button>
    </div>
  );
}

// --- Inline editable cell ---

function EditableCell({
  value,
  field,
  itemId,
  send,
}: {
  value: string;
  field: BoardField | undefined;
  itemId: string;
  send: BoardViewProps["send"];
}) {
  const [editing, setEditing] = useState(false);

  if (!field || !editing) {
    return (
      <span
        onClick={() => field && setEditing(true)}
        className={field ? "cursor-pointer hover:bg-white/10 px-1 rounded transition-colors" : "px-1"}
      >
        {value || "-"}
      </span>
    );
  }

  if (field.type === "single_select" && field.options) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => {
          send({ type: "board-set", itemId, field: field.name, value: e.target.value });
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="bg-gray-800 text-white text-xs rounded px-1 py-0.5 outline-none border border-cyan-500/40"
      >
        <option value="">-</option>
        {field.options.map((o) => (
          <option key={o.id} value={o.name}>{o.name}</option>
        ))}
      </select>
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          if (e.target.value !== value) {
            send({ type: "board-set", itemId, field: field.name, value: e.target.value });
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="bg-gray-800 text-white text-xs rounded px-1 py-0.5 outline-none border border-cyan-500/40"
      />
    );
  }

  return (
    <input
      type="text"
      autoFocus
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) {
          send({ type: "board-set", itemId, field: field.name, value: e.target.value });
        }
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="bg-gray-800 text-white text-xs rounded px-1 py-0.5 outline-none border border-cyan-500/40 w-full"
    />
  );
}

// --- Live oracle status indicator ---

function OracleActivity({ status }: { status?: "busy" | "ready" | "idle" }) {
  if (!status || status === "idle") return null;
  if (status === "busy") {
    return (
      <span className="relative inline-flex ml-1">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
      </span>
    );
  }
  // ready
  return <span className="inline-flex ml-1 w-2 h-2 rounded-full bg-amber-400/60" />;
}

// --- Board Table ---

function BoardTable({ send, agents }: { send: BoardViewProps["send"]; agents: AgentState[] }) {
  const items = useFleetStore((s) => s.boardItems);
  const fields = useFleetStore((s) => s.boardFields);
  const filter = useFleetStore((s) => s.boardFilter);
  const oracleStatus = useOracleStatusMap(agents);
  const taskLogSummaries = useFleetStore((s) => s.taskLogSummaries);
  const setSelectedTaskId = useFleetStore((s) => s.setSelectedTaskId);

  const findField = (name: string) => fields.find((f) => f.name.toLowerCase() === name.toLowerCase());

  const onRowClick = useCallback((item: BoardItem) => {
    setSelectedTaskId(item.id);
    send({ type: "task-log", taskId: item.id });
  }, [setSelectedTaskId, send]);

  const filtered = filter
    ? items.filter((i) => {
        const lower = filter.toLowerCase();
        return (
          i.title.toLowerCase().includes(lower) ||
          i.oracle.toLowerCase().includes(lower) ||
          i.status.toLowerCase().includes(lower) ||
          i.priority.toLowerCase().includes(lower)
        );
      })
    : items;

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-white/30 text-sm">
        No board items. Click Refresh to load from GitHub Projects.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-white/50 text-xs uppercase tracking-wider">
            <th className="px-3 py-2.5 text-left w-10">#</th>
            <th className="px-3 py-2.5 text-left">Title</th>
            <th className="px-3 py-2.5 text-left w-24">Priority</th>
            <th className="px-3 py-2.5 text-left w-24">Client</th>
            <th className="px-3 py-2.5 text-left w-28">Oracle</th>
            <th className="px-3 py-2.5 text-left w-28">Status</th>
            <th className="px-3 py-2.5 text-left w-28">Start</th>
            <th className="px-3 py-2.5 text-left w-28">Target</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item) => {
            const summary = taskLogSummaries[item.id];
            return (
            <tr
              key={item.id}
              onClick={() => onRowClick(item)}
              className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer"
            >
              <td className="px-3 py-2 text-white/30 font-mono text-xs">{item.index}</td>
              <td className="px-3 py-2 text-white/90">
                <span className="hover:text-cyan-400 transition-colors">
                  {item.title}
                </span>
                {item.content.number > 0 && (
                  <span className="ml-1.5 text-white/30 text-xs">#{item.content.number}</span>
                )}
                {summary && (
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${summary.hasBlockers ? "bg-red-500/20 text-red-400" : "bg-white/[0.06] text-white/40"}`}>
                    {summary.count}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    color: PRIORITY_COLORS[item.priority] || "#9ca3af",
                    background: `${PRIORITY_COLORS[item.priority] || "#9ca3af"}15`,
                  }}
                >
                  <EditableCell value={item.priority} field={findField("Priority")} itemId={item.id} send={send} />
                </span>
              </td>
              <td className="px-3 py-2 text-white/60 text-xs">
                <EditableCell value={item.client} field={findField("Client")} itemId={item.id} send={send} />
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center text-cyan-400/80 text-xs">
                  <EditableCell value={item.oracle} field={findField("Oracle")} itemId={item.id} send={send} />
                  <OracleActivity status={oracleStatus.get(item.oracle.toLowerCase())} />
                </span>
              </td>
              <td className="px-3 py-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs"
                  style={{ color: STATUS_COLORS[item.status] || "#9ca3af" }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: STATUS_COLORS[item.status] || "#9ca3af" }}
                  />
                  <EditableCell value={item.status} field={findField("Status")} itemId={item.id} send={send} />
                </span>
              </td>
              <td className="px-3 py-2 text-white/40 text-xs font-mono">
                <EditableCell value={item.startDate} field={findField("Start Date") || findField("Start date")} itemId={item.id} send={send} />
              </td>
              <td className="px-3 py-2 text-white/40 text-xs font-mono">
                <EditableCell value={item.targetDate} field={findField("Target Date") || findField("Target date")} itemId={item.id} send={send} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 text-xs text-white/20">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        {filter && ` (filtered from ${items.length})`}
      </div>
    </div>
  );
}

// --- Timeline (Gantt) ---

function TimelineView({ connected, send }: { connected: boolean; send: BoardViewProps["send"] }) {
  const timeline = useFleetStore((s) => s.timelineData);
  const loading = useFleetStore((s) => s.boardLoading);

  useEffect(() => {
    if (connected && timeline.length === 0) send({ type: "board-timeline" });
  }, [connected]);

  if (timeline.length === 0 && !loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/30 text-sm">
        No items with dates. Set start/target dates on board items to see the timeline.
      </div>
    );
  }

  // Today marker
  const today = new Date().toISOString().slice(0, 10);
  const allDates = timeline.flatMap((t) => [t.startDate, t.targetDate].filter(Boolean));
  const minTs = Math.min(...allDates.map((d) => new Date(d).getTime()));
  const maxTs = Math.max(...allDates.map((d) => new Date(d).getTime()));
  const totalSpan = Math.max(maxTs - minTs, 86400000);
  const todayOffset = ((new Date(today).getTime() - minTs) / totalSpan) * 100;

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Date header */}
      <div className="relative h-8 mb-2 border-b border-white/10">
        <span className="absolute text-[10px] text-white/30 font-mono" style={{ left: "0%" }}>
          {allDates.length > 0 ? new Date(minTs).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}
        </span>
        <span className="absolute text-[10px] text-white/30 font-mono" style={{ right: "0" }}>
          {allDates.length > 0 ? new Date(maxTs).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}
        </span>
        {/* Today line */}
        {todayOffset >= 0 && todayOffset <= 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500/60"
            style={{ left: `${todayOffset}%` }}
          >
            <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] text-red-400 font-mono">
              today
            </span>
          </div>
        )}
      </div>

      {/* Bars */}
      <div className="space-y-1.5">
        {timeline.map((item) => (
          <div key={item.id} className="relative h-8 group">
            <div
              className="absolute h-full rounded-md flex items-center px-2 overflow-hidden text-xs font-medium transition-all group-hover:brightness-125"
              style={{
                left: `${item.startOffset}%`,
                width: `${Math.max(item.width, 3)}%`,
                background: `${PRIORITY_COLORS[item.priority] || "#6b7280"}30`,
                borderLeft: `3px solid ${PRIORITY_COLORS[item.priority] || "#6b7280"}`,
                color: PRIORITY_COLORS[item.priority] || "#9ca3af",
              }}
            >
              <span className="truncate">
                {item.oracle && <span className="text-white/40 mr-1">{item.oracle}</span>}
                {item.title}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Scan (untracked issues) ---

function ScanView({ send }: { send: BoardViewProps["send"] }) {
  const results = useFleetStore((s) => s.scanResults);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    send({ type: "board-scan" });
    // loading cleared by store update
    setTimeout(() => setLoading(false), 10000);
  }, [send]);

  // Clear loading when results arrive
  useEffect(() => { setLoading(false); }, [results]);

  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-medium text-white/70">Untracked Issues</h3>
        <span className="text-xs text-white/30">
          {totalIssues} issue{totalIssues !== 1 ? "s" : ""} across {results.length} repo{results.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={refresh}
          disabled={loading}
          className="ml-auto px-3 py-1 bg-white/[0.06] text-white/60 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-all disabled:opacity-40"
        >
          {loading ? "Scanning..." : "Re-scan"}
        </button>
      </div>

      {results.length === 0 && !loading && (
        <div className="text-white/30 text-sm py-8 text-center">
          All issues are tracked on the board.
        </div>
      )}

      {results.map((result) => (
        <div key={result.repo} className="mb-4">
          <h4 className="text-xs font-mono text-cyan-400/60 mb-2">{result.repo}</h4>
          <div className="space-y-1">
            {result.issues.map((issue) => (
              <div
                key={issue.number}
                className="flex items-center gap-3 px-3 py-2 bg-white/[0.03] rounded-lg hover:bg-white/[0.05] transition-colors"
              >
                <span className="text-white/30 text-xs font-mono w-10">#{issue.number}</span>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-sm text-white/80 hover:text-cyan-400 transition-colors truncate"
                >
                  {issue.title}
                </a>
                {issue.labels.length > 0 && (
                  <div className="flex gap-1">
                    {issue.labels.slice(0, 3).map((l) => (
                      <span key={l} className="px-1.5 py-0.5 bg-white/[0.06] rounded text-[10px] text-white/40">
                        {l}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => send({ type: "board-add", title: issue.title })}
                  className="px-2 py-1 bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 rounded text-xs hover:bg-cyan-500/25 transition-all flex-shrink-0"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Activity (today's commits) ---

function ActivityView({ send }: { send: BoardViewProps["send"] }) {
  const results = useFleetStore((s) => s.scanMineResults);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    send({ type: "board-scan-mine" });
    setTimeout(() => setLoading(false), 10000);
  }, [send]);

  useEffect(() => { setLoading(false); }, [results]);

  const totalCommits = results.reduce((sum, r) => sum + r.commits.length, 0);

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-medium text-white/70">Today's Activity</h3>
        <span className="text-xs text-white/30">
          {totalCommits} commit{totalCommits !== 1 ? "s" : ""} across {results.length} oracle{results.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={refresh}
          disabled={loading}
          className="ml-auto px-3 py-1 bg-white/[0.06] text-white/60 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-all disabled:opacity-40"
        >
          {loading ? "Scanning..." : "Refresh"}
        </button>
      </div>

      {results.length === 0 && !loading && (
        <div className="text-white/30 text-sm py-8 text-center">
          No commits today yet.
        </div>
      )}

      {results.map((result) => (
        <div key={result.oracle} className="mb-4">
          <h4 className="text-xs font-medium text-cyan-400/80 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400/60" />
            {result.oracleName}
            <span className="text-white/20 font-normal">({result.commits.length} commits)</span>
          </h4>
          <div className="space-y-0.5 pl-4">
            {result.commits.map((commit, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs py-0.5">
                <span className="font-mono text-amber-400/60 w-16 flex-shrink-0">{commit.hash}</span>
                <span className="text-white/70 flex-1">{commit.message}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Pulse view (laris-co/pulse-oracle tasks) ---

function PulseView({ connected, send, agents }: { connected: boolean; send: BoardViewProps["send"]; agents: AgentState[] }) {
  const pulse = useFleetStore((s) => s.pulseBoard);
  const oracleStatus = useOracleStatusMap(agents);
  const [addText, setAddText] = useState("");
  const [addOracle, setAddOracle] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connected && !pulse) send({ type: "pulse-board" });
  }, [connected]);

  useEffect(() => { setLoading(false); }, [pulse]);

  const onAdd = useCallback(() => {
    const title = addText.trim();
    if (!title) return;
    setLoading(true);
    send({ type: "pulse-add", title, oracle: addOracle || undefined });
    setAddText("");
    setAddOracle("");
  }, [addText, addOracle, send]);

  const ORACLE_OPTIONS = ["", "bob", "dev", "qa", "researcher", "writer", "designer", "hr"];

  const renderSection = (label: string, items: { number: number; title: string; oracle: string }[], color: string) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <h4 className="text-xs font-medium mb-2" style={{ color }}>{label} ({items.length})</h4>
        <div className="space-y-0.5">
          {items.map((item) => (
            <div key={item.number} className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-lg hover:bg-white/[0.05] transition-colors text-xs">
              <span className="text-white/30 font-mono w-10">#{item.number}</span>
              <span className="text-white/80 flex-1 truncate">{item.title}</span>
              {item.oracle && (
                <span className="inline-flex items-center text-cyan-400/70">
                  {item.oracle}
                  <OracleActivity status={oracleStatus.get(item.oracle.toLowerCase())} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Add pulse task */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
        <span className="text-xs text-white/40">pulse add</span>
        <input
          type="text"
          placeholder="Task title..."
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          className="flex-1 px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/30 outline-none focus:border-cyan-500/40"
        />
        <select
          value={addOracle}
          onChange={(e) => setAddOracle(e.target.value)}
          className="px-2 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs text-white/60 outline-none"
        >
          {ORACLE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o || "auto"}</option>
          ))}
        </select>
        <button
          onClick={onAdd}
          disabled={!addText.trim() || loading}
          className="px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-40"
        >
          {loading ? "..." : "Add"}
        </button>
        <button
          onClick={() => { setLoading(true); send({ type: "pulse-board" }); }}
          disabled={loading}
          className="px-3 py-1.5 bg-white/[0.06] text-white/60 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-all disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {!pulse && (
        <div className="text-white/30 text-sm py-8 text-center">
          Loading pulse board...
        </div>
      )}

      {pulse && (
        <>
          {renderSection("In Progress", pulse.active, "#eab308")}
          {renderSection("Todo", pulse.projects, "#22d3ee")}
          {renderSection("Done", pulse.tools, "#22c55e")}
          <div className="mt-4 text-xs text-white/20">
            {pulse.total} open items
            {pulse.threads.length > 0 && ` · ${pulse.threads.length} daily thread${pulse.threads.length !== 1 ? "s" : ""}`}
          </div>
        </>
      )}
    </div>
  );
}

// --- Dispatch feed (live team communication) ---

function DispatchFeed({ agents }: { agents: AgentState[] }) {
  const dispatchLog = useFleetStore((s) => s.dispatchLog);
  const oracleStatus = useOracleStatusMap(agents);

  const recent = dispatchLog.slice(-8).reverse();

  if (recent.length === 0) return null;

  return (
    <div className="border-t border-white/[0.06] px-4 sm:px-6 py-3">
      <h3 className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Team Activity</h3>
      <div className="space-y-1">
        {recent.map((d, i) => {
          const isActive = d.oracle && oracleStatus.get(d.oracle) === "busy";
          const age = Date.now() - d.ts;
          const timeStr = age < 60_000 ? "just now" : age < 3600_000 ? `${Math.floor(age / 60_000)}m ago` : `${Math.floor(age / 3600_000)}h ago`;
          return (
            <div key={d.ts + "-" + i} className="flex items-center gap-2 text-xs">
              {/* Status dot */}
              {d.step === "done" && isActive ? (
                <span className="relative flex-shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
                  <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </span>
              ) : d.step === "done" ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500/50 flex-shrink-0" />
              ) : d.step === "routing" ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
              )}
              {/* Oracle name */}
              <span className={`font-medium ${isActive ? "text-cyan-400" : "text-cyan-400/50"}`}>
                {d.oracleName || d.oracle || "?"}
              </span>
              {/* Message */}
              <span className="text-white/40 truncate flex-1">
                {d.step === "routing" ? "routing..." : d.step === "done" ? (d.task || "").slice(0, 60) : d.error?.slice(0, 60)}
              </span>
              {/* Time */}
              <span className="text-white/20 flex-shrink-0">{timeStr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main BoardView ---

export const BoardView = memo(function BoardView({ connected, send, agents }: BoardViewProps) {
  const subView = useFleetStore((s) => s.boardSubView);
  const setBoardLoading = useFleetStore((s) => s.setBoardLoading);
  const dispatchLog = useFleetStore((s) => s.dispatchLog);

  // Load board data + task log summaries when connected
  useEffect(() => {
    if (!connected) return;
    setBoardLoading(true);
    send({ type: "board" });
    send({ type: "task-log-summaries" });
  }, [connected, send, setBoardLoading]);

  // Auto-refresh board when a dispatch completes
  const lastDispatch = dispatchLog[dispatchLog.length - 1];
  useEffect(() => {
    if (!connected || !lastDispatch || lastDispatch.step !== "done") return;
    // Small delay to let GitHub API propagate
    const timer = setTimeout(() => send({ type: "board" }), 2000);
    return () => clearTimeout(timer);
  }, [connected, lastDispatch?.ts]);

  return (
    <div className="relative z-10 mx-2 sm:mx-4 md:mx-6 mt-3 sm:mt-4 rounded-xl sm:rounded-2xl bg-black/30 backdrop-blur-sm border border-white/[0.06] overflow-hidden">
      <Toolbar send={send} />
      <div className="border-t border-white/[0.06]">
        {subView === "board" && <BoardTable send={send} agents={agents} />}
        {subView === "projects" && <ProjectBoardView send={send} agents={agents} />}
        {subView === "pulse" && <PulseView connected={connected} send={send} agents={agents} />}
        {subView === "timeline" && <TimelineView connected={connected} send={send} />}
        {subView === "scan" && <ScanView send={send} />}
        {subView === "activity" && <ActivityView send={send} />}
      </div>
      <DispatchFeed agents={agents} />
      <TaskDetailOverlay send={send} />
    </div>
  );
});

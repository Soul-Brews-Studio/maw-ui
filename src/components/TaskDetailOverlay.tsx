import { useState, useCallback, useRef, useEffect } from "react";
import { useFleetStore } from "../lib/store";
import type { TaskActivity, TaskActivityType, BoardItem } from "../lib/types";

interface TaskDetailOverlayProps {
  send: (msg: Record<string, unknown>) => void;
}

const TYPE_CONFIG: Record<TaskActivityType, { icon: string; color: string; label: string }> = {
  message: { icon: "💬", color: "#3b82f6", label: "Message" },
  commit: { icon: "📦", color: "#22c55e", label: "Commit" },
  status_change: { icon: "🔄", color: "#eab308", label: "Status" },
  note: { icon: "📝", color: "#9ca3af", label: "Note" },
  blocker: { icon: "🚫", color: "#ef4444", label: "Blocker" },
  comment: { icon: "🗨", color: "#8b5cf6", label: "Comment" },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function ActivityItem({ activity }: { activity: TaskActivity }) {
  const cfg = TYPE_CONFIG[activity.type] || TYPE_CONFIG.note;

  return (
    <div className="flex gap-3 py-2 group">
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0"
          style={{ background: `${cfg.color}20`, border: `1px solid ${cfg.color}40` }}
        >
          {cfg.icon}
        </div>
        <div className="w-px flex-1 bg-white/[0.06] mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-cyan-400/80">{activity.oracle}</span>
          <span className="text-[10px] text-white/30 font-mono">{formatTime(activity.ts)}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ color: cfg.color, background: `${cfg.color}15` }}
          >
            {cfg.label}
          </span>
        </div>
        <p className="text-sm text-white/80 mt-0.5 break-words">{activity.content}</p>
        {activity.type === "commit" && activity.meta?.commitHash && (
          <span className="text-xs font-mono text-amber-400/60">{activity.meta.commitHash}</span>
        )}
        {activity.type === "blocker" && (
          <span className={`text-xs ${activity.meta?.resolved ? "text-emerald-400" : "text-red-400"}`}>
            {activity.meta?.resolved ? "Resolved" : "Open"}
          </span>
        )}
        {activity.type === "status_change" && activity.meta?.oldStatus && (
          <span className="text-xs text-white/40">
            {activity.meta.oldStatus} → {activity.meta.newStatus}
          </span>
        )}
      </div>
    </div>
  );
}

export function TaskDetailOverlay({ send }: TaskDetailOverlayProps) {
  const selectedTaskId = useFleetStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useFleetStore((s) => s.setSelectedTaskId);
  const activities = useFleetStore((s) => s.taskActivities);
  const boardItems = useFleetStore((s) => s.boardItems);

  const projectBoardProjects = useFleetStore((s) => s.projectBoardProjects);
  const [addContent, setAddContent] = useState("");
  const [addType, setAddType] = useState<TaskActivityType>("comment");
  const timelineEnd = useRef<HTMLDivElement>(null);

  const item: BoardItem | undefined = boardItems.find((i) => i.id === selectedTaskId);

  // Scroll to bottom when activities change
  useEffect(() => {
    timelineEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities.length]);

  const onAdd = useCallback(() => {
    const content = addContent.trim();
    if (!content || !selectedTaskId) return;
    send({
      type: "task-log-add",
      taskId: selectedTaskId,
      activityType: addType,
      content,
      oracle: "dashboard",
    });
    setAddContent("");
  }, [addContent, addType, selectedTaskId, send]);

  const onClose = useCallback(() => {
    setSelectedTaskId(null);
  }, [setSelectedTaskId]);

  if (!selectedTaskId) return null;

  // Group activities by date
  const grouped: { date: string; items: TaskActivity[] }[] = [];
  let currentDate = "";
  for (const a of activities) {
    const d = formatDate(a.ts);
    if (d !== currentDate) {
      currentDate = d;
      grouped.push({ date: d, items: [a] });
    } else {
      grouped[grouped.length - 1].items.push(a);
    }
  }

  const contributors = [...new Set(activities.map((a) => a.oracle).filter(Boolean))];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:max-w-lg bg-gray-900/95 backdrop-blur-lg border-l border-white/10 z-50 flex flex-col overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-medium text-white/90 truncate">
                {item?.title || selectedTaskId}
              </h2>
              {item && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {item.content.number > 0 && (
                    <a
                      href={item.content.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400/70 hover:text-cyan-400 font-mono"
                    >
                      #{item.content.number}
                    </a>
                  )}
                  {item.status && (
                    <span className="text-xs px-2 py-0.5 rounded bg-white/[0.06] text-white/60">
                      {item.status}
                    </span>
                  )}
                  {item.priority && (
                    <span className="text-xs px-2 py-0.5 rounded bg-white/[0.06] text-white/60">
                      {item.priority}
                    </span>
                  )}
                  {item.oracle && (
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400/80">
                      {item.oracle}
                    </span>
                  )}
                </div>
              )}
              {/* Project badge */}
              {(() => {
                const proj = projectBoardProjects.find((p) =>
                  p.enrichedTasks?.some((t) => t.taskId === selectedTaskId)
                );
                return proj ? (
                  <div className="mt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400/70">
                      {proj.name}
                    </span>
                  </div>
                ) : null;
              })()}
              {item && (item.startDate || item.targetDate) && (
                <div className="text-[11px] text-white/30 mt-1 font-mono">
                  {item.startDate && `Start: ${item.startDate}`}
                  {item.startDate && item.targetDate && " · "}
                  {item.targetDate && `Target: ${item.targetDate}`}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/80 ml-3 p-1 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Activity timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {activities.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-white/30 text-sm">
              No activity logged yet. Add the first entry below.
            </div>
          ) : (
            <>
              {grouped.map((group) => (
                <div key={group.date}>
                  <div className="text-[10px] uppercase tracking-wider text-white/25 font-medium py-2 mt-2">
                    {group.date}
                  </div>
                  {group.items.map((a) => (
                    <ActivityItem key={a.id} activity={a} />
                  ))}
                </div>
              ))}
            </>
          )}
          <div ref={timelineEnd} />
        </div>

        {/* Contributors */}
        {contributors.length > 0 && (
          <div className="px-5 py-2 border-t border-white/[0.06] flex-shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-white/25">Contributors: </span>
            <span className="text-xs text-cyan-400/60">{contributors.join(", ")}</span>
          </div>
        )}

        {/* Quick-add bar */}
        <div className="px-5 py-3 border-t border-white/[0.08] flex-shrink-0">
          <div className="flex gap-2">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as TaskActivityType)}
              className="px-2 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs text-white/60 outline-none flex-shrink-0"
            >
              <option value="comment">Comment</option>
              <option value="note">Note</option>
              <option value="message">Message</option>
              <option value="commit">Commit</option>
              <option value="blocker">Blocker</option>
              <option value="status_change">Status</option>
            </select>
            <input
              type="text"
              placeholder="Add activity..."
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAdd()}
              className="flex-1 px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/30 outline-none focus:border-cyan-500/40"
            />
            <button
              onClick={onAdd}
              disabled={!addContent.trim()}
              className="px-4 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-40 flex-shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

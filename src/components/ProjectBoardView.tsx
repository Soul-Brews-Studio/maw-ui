import { useState, useCallback, useMemo } from "react";
import { useFleetStore } from "../lib/store";
import type { BoardItem, BoardField, AgentState, ProjectTask } from "../lib/types";

interface ProjectBoardViewProps {
  send: (msg: Record<string, unknown>) => void;
  agents: AgentState[];
}

const STATUS_COLORS: Record<string, string> = {
  "Done": "#22c55e",
  "In Progress": "#eab308",
  "Todo": "#6b7280",
  "Backlog": "#4b5563",
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#ef4444", P1: "#f97316", P2: "#eab308", P3: "#22d3ee", P4: "#6b7280",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  completed: "#3b82f6",
  archived: "#6b7280",
};

function statusIcon(status: string) {
  if (status === "Done") return <span className="w-3 h-3 rounded-full bg-emerald-500/60 inline-block" />;
  if (status === "In Progress") return <span className="w-3 h-3 rounded-full bg-amber-400/60 inline-block" />;
  if (status === "Todo") return <span className="w-3 h-3 rounded-full bg-white/20 inline-block border border-white/20" />;
  return <span className="w-3 h-3 rounded-full bg-white/10 inline-block" />;
}

function TaskRow({
  task,
  indent,
  send,
  onSelect,
  logCount,
}: {
  task: ProjectTask & { boardItem?: BoardItem };
  indent: number;
  send: ProjectBoardViewProps["send"];
  onSelect: (taskId: string) => void;
  logCount?: number;
}) {
  const item = task.boardItem;
  if (!item) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/20 hover:bg-white/[0.02] transition-colors"
        style={{ paddingLeft: `${12 + indent * 24}px` }}
      >
        <span className="w-3 h-3 rounded-full bg-white/5 inline-block" />
        <span className="font-mono">{task.taskId.slice(0, 16)}...</span>
        <span>(removed from board)</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(item.id)}
      className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors cursor-pointer group"
      style={{ paddingLeft: `${12 + indent * 24}px` }}
    >
      {indent > 0 && (
        <span className="text-white/15 mr-1">└─</span>
      )}
      {statusIcon(item.status)}
      {item.content.number > 0 && (
        <span className="text-white/30 font-mono text-xs w-10 flex-shrink-0">#{item.content.number}</span>
      )}
      <span className="text-sm text-white/85 flex-1 truncate group-hover:text-cyan-400 transition-colors">
        {item.title}
      </span>
      {item.priority && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{ color: PRIORITY_COLORS[item.priority] || "#9ca3af", background: `${PRIORITY_COLORS[item.priority] || "#9ca3af"}15` }}
        >
          {item.priority}
        </span>
      )}
      {item.oracle && (
        <span className="text-xs text-cyan-400/60 flex-shrink-0 w-20 truncate">{item.oracle}</span>
      )}
      <span
        className="text-[10px] px-2 py-0.5 rounded flex-shrink-0"
        style={{ color: STATUS_COLORS[item.status] || "#9ca3af", background: `${STATUS_COLORS[item.status] || "#9ca3af"}15` }}
      >
        {item.status}
      </span>
      {logCount != null && logCount > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 flex-shrink-0">
          {logCount}
        </span>
      )}
    </div>
  );
}

function ProjectSection({
  project,
  send,
  onSelectTask,
  taskLogSummaries,
  defaultExpanded,
}: {
  project: { id: string; name: string; description: string; status: string; enrichedTasks: (ProjectTask & { boardItem?: BoardItem })[] };
  send: ProjectBoardViewProps["send"];
  onSelectTask: (taskId: string) => void;
  taskLogSummaries: Record<string, any>;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const tasks = project.enrichedTasks;
  const topLevel = tasks.filter((t) => !t.parentTaskId);
  const subtaskMap = useMemo(() => {
    const m = new Map<string, (ProjectTask & { boardItem?: BoardItem })[]>();
    for (const t of tasks) {
      if (t.parentTaskId) {
        const arr = m.get(t.parentTaskId) || [];
        arr.push(t);
        m.set(t.parentTaskId, arr);
      }
    }
    return m;
  }, [tasks]);

  // Progress
  const total = tasks.filter((t) => t.boardItem).length;
  const done = tasks.filter((t) => t.boardItem?.status === "Done").length;
  const inProgress = tasks.filter((t) => t.boardItem?.status === "In Progress").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mb-3">
      {/* Project header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors cursor-pointer rounded-t-lg"
      >
        <span className="text-white/40 text-xs">{expanded ? "▼" : "▶"}</span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: PROJECT_STATUS_COLORS[project.status] || "#6b7280" }}
        />
        <span className="text-sm font-medium text-white/90">{project.name}</span>
        <span className="text-[10px] text-white/30 font-mono">({project.id})</span>
        {project.description && (
          <span className="text-xs text-white/30 truncate max-w-60">{project.description}</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: progress === 100 ? "#22c55e" : "#eab308" }}
              />
            </div>
            <span className="text-[10px] text-white/30 w-8">{progress}%</span>
          </div>
          {/* Counts */}
          <span className="text-[10px] text-white/25">
            <span className="text-emerald-400/60">{done}</span>
            {inProgress > 0 && <span className="text-amber-400/60 ml-1">{inProgress}</span>}
            <span className="text-white/20 ml-1">/ {total}</span>
          </span>
        </div>
      </div>

      {/* Tasks */}
      {expanded && (
        <div className="border border-white/[0.04] border-t-0 rounded-b-lg overflow-hidden">
          {topLevel.length === 0 ? (
            <div className="px-4 py-3 text-xs text-white/20">No tasks in this project yet.</div>
          ) : (
            topLevel.map((task) => (
              <div key={task.taskId}>
                <TaskRow
                  task={task}
                  indent={0}
                  send={send}
                  onSelect={onSelectTask}
                  logCount={taskLogSummaries[task.taskId]?.count}
                />
                {subtaskMap.get(task.taskId)?.map((sub) => (
                  <TaskRow
                    key={sub.taskId}
                    task={sub}
                    indent={1}
                    send={send}
                    onSelect={onSelectTask}
                    logCount={taskLogSummaries[sub.taskId]?.count}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ProjectBoardView({ send, agents }: ProjectBoardViewProps) {
  const projects = useFleetStore((s) => s.projectBoardProjects);
  const unassigned = useFleetStore((s) => s.projectBoardUnassigned);
  const taskLogSummaries = useFleetStore((s) => s.taskLogSummaries);
  const setSelectedTaskId = useFleetStore((s) => s.setSelectedTaskId);
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [organizing, setOrganizing] = useState(false);

  const onSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    send({ type: "task-log", taskId });
  }, [setSelectedTaskId, send]);

  const onAutoOrganize = useCallback(() => {
    setOrganizing(true);
    send({ type: "project-auto-organize" });
    setTimeout(() => setOrganizing(false), 5000);
  }, [send]);

  const onCreate = useCallback(() => {
    if (!newId.trim() || !newName.trim()) return;
    send({ type: "project-create", id: newId.trim().toLowerCase().replace(/\s+/g, "-"), name: newName.trim() });
    setNewId("");
    setNewName("");
    setShowCreate(false);
  }, [newId, newName, send]);

  const onMoveToProject = useCallback((taskId: string, projectId: string) => {
    send({ type: "project-add-task", projectId, taskId });
  }, [send]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const completedProjects = projects.filter((p) => p.status === "completed");
  const archivedProjects = projects.filter((p) => p.status === "archived");

  return (
    <div className="px-4 sm:px-6 py-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-medium text-white/70">Projects</h3>
        <span className="text-xs text-white/30">
          {activeProjects.length} active
          {completedProjects.length > 0 && `, ${completedProjects.length} completed`}
          {unassigned.length > 0 && ` · ${unassigned.length} unassigned`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onAutoOrganize}
            disabled={organizing}
            className="px-3 py-1 bg-purple-500/15 text-purple-400 border border-purple-500/25 rounded-lg text-xs hover:bg-purple-500/25 transition-all disabled:opacity-40"
          >
            {organizing ? "Organizing..." : "Auto-organize"}
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1 bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 rounded-lg text-xs hover:bg-cyan-500/25 transition-all"
          >
            + New Project
          </button>
          <button
            onClick={() => send({ type: "project-board" })}
            className="px-3 py-1 bg-white/[0.06] text-white/60 border border-white/10 rounded-lg text-xs hover:bg-white/10 transition-all"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
          <input
            type="text"
            placeholder="project-id"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            className="px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs text-white/80 placeholder-white/30 outline-none focus:border-cyan-500/40 w-36 font-mono"
          />
          <input
            type="text"
            placeholder="Project Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
            className="flex-1 px-3 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-sm text-white/80 placeholder-white/30 outline-none focus:border-cyan-500/40"
          />
          <button
            onClick={onCreate}
            disabled={!newId.trim() || !newName.trim()}
            className="px-4 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-all disabled:opacity-40"
          >
            Create
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="px-3 py-1.5 text-white/40 hover:text-white/60 text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Active projects */}
      {activeProjects.length === 0 && unassigned.length === 0 && (
        <div className="text-center py-12 text-white/25 text-sm">
          No projects yet. Click "Auto-organize" to group existing tasks, or "New Project" to create one.
        </div>
      )}

      {activeProjects.map((project) => (
        <ProjectSection
          key={project.id}
          project={project}
          send={send}
          onSelectTask={onSelectTask}
          taskLogSummaries={taskLogSummaries}
          defaultExpanded={true}
        />
      ))}

      {/* Unassigned tasks */}
      {unassigned.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/[0.04] rounded-t-lg border border-amber-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-400/50 flex-shrink-0" />
            <span className="text-sm font-medium text-amber-400/80">Unassigned</span>
            <span className="text-xs text-white/30">{unassigned.length} tasks not in any project</span>
          </div>
          <div className="border border-white/[0.04] border-t-0 rounded-b-lg overflow-hidden">
            {unassigned.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] transition-colors group"
              >
                {statusIcon(item.status)}
                {item.content.number > 0 && (
                  <span className="text-white/30 font-mono text-xs w-10 flex-shrink-0">#{item.content.number}</span>
                )}
                <span
                  onClick={() => onSelectTask(item.id)}
                  className="text-sm text-white/70 flex-1 truncate hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  {item.title}
                </span>
                {item.oracle && (
                  <span className="text-xs text-cyan-400/50 flex-shrink-0">{item.oracle}</span>
                )}
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ color: STATUS_COLORS[item.status] || "#9ca3af", background: `${STATUS_COLORS[item.status] || "#9ca3af"}15` }}
                >
                  {item.status}
                </span>
                {/* Move to project dropdown */}
                {activeProjects.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) onMoveToProject(item.id, e.target.value);
                      e.target.value = "";
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[10px] text-white/50 outline-none flex-shrink-0"
                  >
                    <option value="">Move to...</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed projects (collapsed by default) */}
      {completedProjects.length > 0 && (
        <div className="mt-6">
          <h4 className="text-[10px] uppercase tracking-wider text-white/20 mb-2">Completed</h4>
          {completedProjects.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              send={send}
              onSelectTask={onSelectTask}
              taskLogSummaries={taskLogSummaries}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}

      {/* Archived projects */}
      {archivedProjects.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[10px] uppercase tracking-wider text-white/15 mb-2">Archived</h4>
          {archivedProjects.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              send={send}
              onSelectTask={onSelectTask}
              taskLogSummaries={taskLogSummaries}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { memo } from "react";

export interface TeamMember {
  name: string;
  color: string | null;
  backendType: string | null;
  isActive: boolean | null;
  tmuxPaneId: string;
  model?: string;
  cwd?: string;
  agentType?: string;
  joinedAt?: number;
}

export interface Team {
  name: string;
  description: string;
  members: TeamMember[];
  createdAt?: number;
  alive?: boolean;
}

interface Task {
  id: string;
  subject: string;
  status: string;
  owner: string | null;
}

export const COLOR_MAP: Record<string, string> = {
  blue: "#60a5fa",
  green: "#4ade80",
  red: "#f87171",
  yellow: "#facc15",
  purple: "#c084fc",
  cyan: "#22d3ee",
  orange: "#fb923c",
  pink: "#f472b6",
};

function shortModel(raw?: string): string {
  if (!raw) return "–";
  const m = raw.replace(/\[.*\]$/, ""); // strip [1m] suffix
  if (m.includes("opus")) return "opus";
  if (m.includes("sonnet")) return "sonnet";
  if (m.includes("haiku")) return "haiku";
  if (m === "inherit") return "inherit";
  return m.split("-").pop() || m; // fallback: last segment
}

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function cwdShort(cwd?: string): string {
  if (!cwd) return "";
  const parts = cwd.split("/");
  // Show last 2 parts: org/repo
  return parts.slice(-2).join("/");
}

export const TeamPanel = memo(function TeamPanel({ teams: teamsRaw }: { teams?: Team[] }) {
  // Derive tasks from team data (tasks come embedded in team config)
  const teams = teamsRaw || [];
  const tasks: Record<string, Task[]> = {};
  for (const team of teams) {
    tasks[team.name] = (team as any).tasks || [];
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12" style={{ minHeight: "calc(100vh - 120px)" }}>
        <div className="text-4xl opacity-20">🤖</div>
        <div className="text-white/30 font-mono text-sm text-center">
          No active teams
        </div>
        <div className="text-white/15 font-mono text-xs text-center max-w-sm">
          Use <span className="text-cyan-400/50">TeamCreate</span> in Claude Code to spawn a team, or <span className="text-cyan-400/50">maw team create</span> from CLI
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6 p-6 overflow-y-auto" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-xs font-mono text-white/30">
          {teams.filter(t => t.alive !== false).length} active
        </span>
        {teams.some(t => t.alive === false) && (
          <>
            <span className="text-xs font-mono text-white/20">·</span>
            <span className="text-xs font-mono text-white/15">{teams.filter(t => t.alive === false).length} stale</span>
          </>
        )}
        <span className="text-xs font-mono text-white/20">·</span>
        <span className="text-xs font-mono text-white/30">{teams.reduce((n, t) => n + t.members.length, 0)} agents</span>
      </div>

      {/* Sort: alive first, then stale */}
      {[...teams].sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0)).map(team => {
        const teamTasks = tasks[team.name] || [];
        const done = teamTasks.filter(t => t.status === "completed").length;
        const total = teamTasks.length;
        const lead = team.members.find(m => m.name === "team-lead" || m.agentType === "team-lead");
        const teammates = team.members.filter(m => m !== lead);
        const stale = team.alive === false;

        return (
          <div key={team.name} className="rounded-2xl overflow-hidden transition-opacity duration-300" style={{
            background: "#12121c",
            border: stale ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(255,255,255,0.08)",
            opacity: stale ? 0.45 : 1,
          }}>
            {/* Header */}
            <div className="px-6 py-5 flex items-start gap-4" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold tracking-[3px] uppercase ${stale ? "text-white/30" : "text-cyan-400"}`}>{team.name}</span>
                  {stale && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.04)", color: "#666" }}>
                      stale
                    </span>
                  )}
                  {!stale && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                  )}
                  {total > 0 && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md" style={{
                      background: done === total ? "rgba(74,222,128,0.12)" : "rgba(250,204,21,0.12)",
                      color: done === total ? "#4ade80" : "#facc15"
                    }}>
                      {done}/{total} tasks
                    </span>
                  )}
                </div>
                {team.description && (
                  <div className="text-[12px] text-white/40 font-mono leading-relaxed truncate">{team.description}</div>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {team.createdAt && (
                    <span className="text-[10px] text-white/20 font-mono">created {timeAgo(team.createdAt)}</span>
                  )}
                  {lead?.cwd && (
                    <span className="text-[10px] text-white/15 font-mono truncate">{cwdShort(lead.cwd)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-white/30 font-mono">{team.members.length}</span>
                <div className="flex -space-x-2">
                  {team.members.slice(0, 5).map(m => {
                    const color = COLOR_MAP[m.color || ""] || "#555";
                    return (
                      <div key={m.name} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold border-2"
                        style={{ background: `${color}25`, borderColor: "#12121c", color }}
                        title={m.name}>
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                  {team.members.length > 5 && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-mono border-2"
                      style={{ background: "rgba(255,255,255,0.05)", borderColor: "#12121c", color: "#666" }}>
                      +{team.members.length - 5}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Lead */}
            {lead && (
              <div className="px-6 py-3 flex items-center gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(96,165,250,0.03)" }}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#60a5fa", boxShadow: "0 0 6px #60a5fa" }} />
                <span className="text-[13px] font-mono font-semibold text-white/70">team-lead</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}>
                  {shortModel(lead.model)}
                </span>
                <span className="text-[10px] text-white/15 font-mono ml-auto">lead</span>
              </div>
            )}

            {/* Teammates */}
            {teammates.length > 0 && (
              <div className="flex flex-col">
                {teammates.map((m, i) => {
                  const color = COLOR_MAP[m.color || ""] || "#888";
                  const model = shortModel(m.model);
                  const isLast = i === teammates.length - 1;
                  return (
                    <div key={m.name} className="px-6 py-3 flex items-center gap-3"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: isLast ? "none" : undefined }}>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                      <span className="text-[13px] font-mono text-white/70">{m.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>
                        {model}
                      </span>
                      {m.agentType && m.agentType !== "general-purpose" && m.agentType !== "team-lead" && (
                        <span className="text-[10px] font-mono text-white/20">{m.agentType}</span>
                      )}
                      {m.backendType && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-auto" style={{
                          background: m.backendType === "tmux" ? "rgba(34,211,238,0.08)" : "rgba(255,255,255,0.04)",
                          color: m.backendType === "tmux" ? "#22d3ee" : "#555"
                        }}>
                          {m.backendType === "in-process" ? "in-proc" : m.backendType}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tasks */}
            {teamTasks.length > 0 && (
              <div className="px-6 py-4 flex flex-col gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
                <div className="text-[10px] font-mono text-white/25 uppercase tracking-[2px] mb-1">Tasks</div>
                {teamTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 text-[12px] font-mono">
                    <span className="w-4 text-center flex-shrink-0">
                      {t.status === "completed" ? "✅" : t.status === "in_progress" ? "🔄" : "⬜"}
                    </span>
                    <span className={`flex-1 truncate ${t.status === "completed" ? "text-white/25 line-through" : "text-white/60"}`}>
                      {t.subject}
                    </span>
                    {t.owner && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)", color: "#666" }}>
                        @{t.owner}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

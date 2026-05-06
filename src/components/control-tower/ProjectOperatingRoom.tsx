import { useEffect, useMemo, useState } from "react";
import type {
  AgentProfile,
  ApprovalRequest,
  ControlTowerIssue,
  ProjectItem,
  RunRecord,
} from "../../lib/controlTowerTypes";
import type { OracleBridgeSnapshot, ProjectOperatingRoomRecord, TokenLedger } from "../../lib/companyOsTypes";
import { AgentRunTokenPanel } from "./AgentRunTokenPanel";
import { MissionRoomPanel } from "./MissionRoomPanel";

function statusColor(status?: string) {
  if (status === "done" || status === "approved" || status === "active") return "#22c55e";
  if (status === "running" || status === "queued" || status === "pending" || status === "in_progress") return "#f59e0b";
  if (status === "blocked" || status === "failed" || status === "rejected") return "#ef4444";
  return "#94a3b8";
}

export function ProjectOperatingRoom({ projects, issues, approvals, runs, agents, missionRooms, tokenLedgers, oracleBridge, onOpenIssue, onOpenAgent }: {
  projects: ProjectItem[];
  issues: ControlTowerIssue[];
  approvals: ApprovalRequest[];
  runs: RunRecord[];
  agents: AgentProfile[];
  missionRooms: ProjectOperatingRoomRecord[];
  tokenLedgers: TokenLedger[];
  oracleBridge?: OracleBridgeSnapshot;
  onOpenIssue: (id: string) => void;
  onOpenAgent: (id: string) => void;
}) {
  const firstProjectId = projects[0]?.id || missionRooms[0]?.projectId || "";
  const [projectId, setProjectId] = useState(firstProjectId);

  useEffect(() => {
    if (!projectId && firstProjectId) setProjectId(firstProjectId);
  }, [firstProjectId, projectId]);

  const room = useMemo(() => (
    missionRooms.find((item) => item.projectId === projectId) || missionRooms[0]
  ), [missionRooms, projectId]);
  const activeProjectId = projectId || room?.projectId || "";
  const project = projects.find((item) => item.id === activeProjectId);
  const roomIssueIds = new Set(room?.linkedIssueIds || []);
  const roomRunIds = new Set(room?.linkedRunIds || []);
  const roomApprovalIds = new Set(room?.linkedApprovalIds || []);
  const projectIssues = issues.filter((issue) => issue.projectId === activeProjectId || roomIssueIds.has(issue.id));
  const projectRuns = runs.filter((run) => roomRunIds.has(run.id) || projectIssues.some((issue) => issue.runIds.includes(run.id) || issue.id === run.issueId));
  const projectApprovals = approvals.filter((approval) => roomApprovalIds.has(approval.id) || projectIssues.some((issue) => issue.approvalIds.includes(approval.id)));
  const projectAgents = agents.filter((agent) => projectIssues.some((issue) => issue.assigneeId === agent.id) || projectRuns.some((run) => run.agentId === agent.id));

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-white/[0.07] bg-[#0b0f18] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[2.4px] text-cyan-200/55">Project Operating Room</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">{project?.title || room?.title || "Project room"}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/56">
              Mission Room รวมอยู่ตรงนี้แบบแยกตาม project: คุย สรุป ตัดสินใจ ผูก issue/run/approval และดึง Oracle context แบบมีขอบเขต.
            </p>
          </div>
          <select
            className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/75"
            value={activeProjectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            {missionRooms.filter((item) => !projects.some((projectItem) => projectItem.id === item.projectId)).map((item) => (
              <option key={item.id} value={item.projectId}>{item.title}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <SummaryTile label="Issues" value={`${projectIssues.length}`} tone={projectIssues.some((issue) => issue.status === "blocked") ? "blocked" : "active"} />
          <SummaryTile label="Runs" value={`${projectRuns.length}`} tone={projectRuns.some((run) => run.status === "running" || run.status === "queued") ? "running" : "active"} />
          <SummaryTile label="Approvals" value={`${projectApprovals.filter((approval) => approval.decision === "pending").length}`} tone={projectApprovals.some((approval) => approval.decision === "pending") ? "pending" : "active"} />
          <SummaryTile label="Oracle intents" value={`${oracleBridge?.intentCount ?? 0}`} tone="active" />
        </div>
      </section>

      <MissionRoomPanel room={room} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-3">
          <div className="text-[11px] uppercase tracking-[2px] text-white/35">Work In This Project</div>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {projectIssues.map((issue) => (
              <button key={issue.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-left transition hover:border-cyan-200/30" onClick={() => onOpenIssue(issue.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-white/82">{issue.title}</span>
                  <span className="text-xs" style={{ color: statusColor(issue.status) }}>{issue.status}</span>
                </div>
                <div className="mt-2 text-xs text-white/35">{issue.priority} | {issue.assigneeName || issue.assigneeId || "unassigned"}</div>
              </button>
            ))}
            {projectIssues.length === 0 && <EmptyBlock label="No project issues yet" />}
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-[11px] uppercase tracking-[2px] text-white/35">Agents + Approvals</div>
          <div className="space-y-2">
            {projectAgents.map((agent) => (
              <button key={agent.id} className="block w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-left transition hover:border-cyan-200/30" onClick={() => onOpenAgent(agent.id)}>
                <div className="text-sm font-semibold text-white/82">{agent.name}</div>
                <div className="mt-1 text-xs text-white/35">{agent.title}</div>
              </button>
            ))}
            {projectApprovals.slice(0, 5).map((approval) => (
              <div key={approval.id} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-3">
                <div className="text-sm font-semibold text-amber-100">{approval.title}</div>
                <div className="mt-1 text-xs text-amber-100/55">{approval.decision} | {approval.owner} | {approval.risk}</div>
              </div>
            ))}
            {projectAgents.length === 0 && projectApprovals.length === 0 && <EmptyBlock label="No agents or approvals linked yet" />}
          </div>

          <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="text-[11px] uppercase tracking-[1.6px] text-white/35">Oracle Bridge</div>
            <div className="mt-2 text-sm text-white/62">{oracleBridge?.mode || "read_link_intent"}</div>
            <div className="mt-2 text-xs leading-5 text-white/35">
              allowlist: {(oracleBridge?.allowlist || []).join(", ") || "ψ/, ops/docs/"}
            </div>
          </div>
        </section>
      </div>

      <AgentRunTokenPanel
        ledgers={tokenLedgers}
        runs={projectRuns}
        agents={agents}
        projectId={activeProjectId}
      />
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[1.6px] text-white/35">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: statusColor(tone) }}>{value}</div>
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3 text-sm text-white/35">{label}</div>;
}

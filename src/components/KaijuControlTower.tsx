import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "../lib/api";
import type { AgentState } from "../lib/types";
import { ProjectOperatingRoom } from "./control-tower/ProjectOperatingRoom";
import {
  STEWARD_STATUS_COLOR,
  STEWARD_STATUS_LABEL,
  type StewardRow,
} from "../lib/stewardTypes";
import {
  APPROVAL_SCHEMA_VERSION,
  compareSchemaVersion,
  type ApprovalPayload,
  type ApproveResult,
  type SchemaVersionState,
} from "../lib/d1ApproveTypes";
import { WorkOrganizationOverview } from "./control-tower/WorkOrganizationOverview";
import type { DecisionBrief, DecisionBriefOption, DecisionQueueSnapshot } from "../lib/companyOsTypes";
import {
  EMPTY_CONTROL_TOWER_PAYLOAD,
  type ActivityEvent,
  type AgentProfile,
  type ApprovalItem,
  type ApprovalRequest,
  type BudgetPolicy,
  type BusinessMetric,
  type CompanyProfile,
  type ControlTowerHealth,
  type ControlTowerIssue,
  type ControlTowerPayload,
  type IssuePriority,
  type IssueStatus,
  type ProjectItem,
  type ProjectTask,
  type RoutineRecord,
  type RunRecord,
  type OracleRunnerSyncSnapshot,
  type SecretRef,
  type SkillBinding,
} from "../lib/controlTowerTypes";

interface Props {
  agents: AgentState[];
  connected: boolean;
  onSelectAgent: (agent: AgentState) => void;
}

type TabKey =
  | "dashboard"
  | "project-room"
  | "inbox"
  | "issues"
  | "routines"
  | "goals"
  | "org"
  | "agents"
  | "skills"
  | "costs"
  | "activity"
  | "settings";

type DecisionBriefActionStatus = "approved" | "rejected" | "request_changes" | "deferred";
type ApprovalActionDecision = "approved" | "rejected" | "changes_requested";

type ModalState = "issue" | "agent" | "routine" | "secret" | "budget" | null;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "project-room", label: "Project Room" },
  { key: "inbox", label: "Inbox" },
  { key: "issues", label: "Issues" },
  { key: "routines", label: "Routines" },
  { key: "goals", label: "Goals" },
  { key: "org", label: "Org" },
  { key: "agents", label: "Agents" },
  { key: "skills", label: "Skills" },
  { key: "costs", label: "Costs" },
  { key: "activity", label: "Activity" },
  { key: "settings", label: "Settings" },
];

const ISSUE_COLUMNS: Array<{ key: IssueStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

const ISSUE_PRIORITY: IssuePriority[] = ["critical", "high", "medium", "low"];
const OPEN_DECISION_STATUSES = new Set(["pending", "draft_context_needed", "request_changes", "deferred"]);

function isOpenDecisionBrief(brief: DecisionBrief): boolean {
  return OPEN_DECISION_STATUSES.has(String(brief.status || "pending"));
}

function healthColor(health: ControlTowerHealth | string | undefined): string {
  if (health === "ok") return "#22c55e";
  if (health === "watch") return "#f59e0b";
  if (health === "blocked") return "#ef4444";
  return "#64748b";
}

function statusColor(status?: string): string {
  if (status === "active" || status === "ready" || status === "done" || status === "approved" || status === "live") return "#22c55e";
  if (status === "running" || status === "busy" || status === "in_progress" || status === "pending" || status === "pending_approval" || status === "review") return "#f59e0b";
  if (status === "blocked" || status === "failed" || status === "rejected" || status === "crashed") return "#ef4444";
  if (status === "paused" || status === "cancelled" || status === "retired") return "#94a3b8";
  return "#64748b";
}

function runtimeStatusColor(status?: AgentState["status"]): string {
  if (status === "ready") return "#22c55e";
  if (status === "busy") return "#f59e0b";
  if (status === "crashed") return "#ef4444";
  return "#64748b";
}

function formatDate(value?: string): string {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function compactMoney(value?: number): string {
  return `$${Number(value || 0).toFixed(2)}`;
}

function shortText(value: string | undefined, fallback = "No summary"): string {
  if (!value) return fallback;
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

function joinLabels(labels?: string[]): string {
  return labels?.length ? labels.join(", ") : "No labels";
}

function matchLiveAgent(profile: AgentProfile, agents: AgentState[]): AgentState | undefined {
  const profileKey = profile.id.toLowerCase();
  const nameKey = profile.name.toLowerCase();
  return agents.find((agent) => {
    const haystack = `${agent.name} ${agent.session} ${agent.target}`.toLowerCase();
    return haystack.includes(profileKey) || haystack.includes(nameKey);
  });
}

function projectHealth(project: ProjectItem): ControlTowerHealth {
  if (project.health) return project.health;
  if (project.status === "blocked") return "blocked";
  if (project.status === "review" || project.status === "active") return "watch";
  if (project.status === "done") return "ok";
  return "missing";
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(`/api/kaiju${path}`), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `Request failed: ${res.status}`);
  return body as T;
}

// FORGE may attach steward rows under any of these payload keys; accept all.
function extractStewardRows(payload: ControlTowerPayload | null): StewardRow[] {
  if (!payload) return [];
  const candidates: Array<unknown> = [
    (payload as Record<string, unknown>).stewardRows,
    (payload as Record<string, unknown>).steward_rows,
    ((payload as Record<string, unknown>).steward as Record<string, unknown> | undefined)?.rows,
    ((payload as Record<string, unknown>).stewardLog as Record<string, unknown> | undefined)?.rows,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as StewardRow[];
  }
  return [];
}

// Relative-time formatter for approval timestamps ("5m ago", "2h ago", "yesterday").
function formatRelativeTs(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "เพิ่งหมาด";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172_800) return "เมื่อวาน";
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

// D1 — read per-project approval state from payload.projects[] (steward source only).
// Returns null when backend has not deployed D1 yet (no projects with `source` + `approval` keys);
// in that case the StewardLogPanel renders read-only (no Approve button column).
function extractApprovalIndex(payload: ControlTowerPayload | null): Map<string, ApprovalPayload | null> | null {
  if (!payload) return null;
  const projects = (payload as Record<string, unknown>).projects;
  if (!Array.isArray(projects)) return null;
  const map = new Map<string, ApprovalPayload | null>();
  let sawApprovalKey = false;
  for (const p of projects) {
    if (!p || typeof p !== "object") continue;
    const proj = p as Record<string, unknown>;
    const source = proj.source;
    const id = proj.id;
    if (source !== "steward" || typeof id !== "string") continue;
    if ("approval" in proj) sawApprovalKey = true;
    const approval = proj.approval;
    map.set(id, approval && typeof approval === "object" ? (approval as ApprovalPayload) : null);
  }
  return sawApprovalKey ? map : null;
}

export function KaijuControlTower({ agents, connected, onSelectAgent }: Props) {
  const [payload, setPayload] = useState<ControlTowerPayload | null>(null);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [issueView, setIssueView] = useState<"kanban" | "list">("kanban");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("david");
  const [selectedIssueId, setSelectedIssueId] = useState<string>("");
  const [modal, setModal] = useState<ModalState>(null);
  const [busyAction, setBusyAction] = useState<string>("");
  const [error, setError] = useState<string>("");
  // D1 [Approve] state
  const [approvalOverrides, setApprovalOverrides] = useState<Map<string, ApprovalPayload | null>>(new Map());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "info"; msg: string } | null>(null);
  const [schemaState, setSchemaState] = useState<SchemaVersionState>({ kind: "missing" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/kaiju/control-tower"));
      if (!res.ok) throw new Error("No control tower feed");
      const data = await res.json() as ControlTowerPayload;
      setPayload(data);
      setError("");
      const reportedVersion = (data as Record<string, unknown>).schema_version;
      setSchemaState(compareSchemaVersion(reportedVersion));
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const data = payload ?? EMPTY_CONTROL_TOWER_PAYLOAD;
  const company = data.company ?? (EMPTY_CONTROL_TOWER_PAYLOAD.company as CompanyProfile);
  const profiles = data.agentProfiles ?? [];
  const issues = data.issues ?? [];
  const approvalRequests = data.approvalRequests ?? [];
  const legacyApprovals = data.approvals ?? [];
  const runs = data.runs ?? [];
  const routines = data.routines ?? [];
  const skills = data.skillBindings ?? [];
  const secrets = data.secrets ?? [];
  const budgets = data.budgets ?? [];
  const activity = data.activity ?? [];
  const projects = data.projects ?? [];
  const tasks = data.tasks ?? [];
  const sources = data.sources ?? [];
  const missionRooms = data.missionRooms ?? [];
  const tokenLedgers = data.tokenLedgers ?? [];
  const oracleBridge = data.oracleBridge;
  const workMap = data.workMap;
  const decisionQueue = data.decisionQueue ?? workMap?.decisionQueue;
  const runnerSync = data.runnerSync;
  const stewardRows = extractStewardRows(payload);
  // D1 — server approval state, with optimistic overrides on top.
  const serverApprovalIndex = extractApprovalIndex(payload);
  const approvalIndex: Map<string, ApprovalPayload | null> | null = serverApprovalIndex
    ? new Map([...serverApprovalIndex, ...approvalOverrides])
    : (approvalOverrides.size > 0 ? new Map(approvalOverrides) : null);

  const onApprove = useCallback(async (projectId: string, projectName: string) => {
    if (approvingIds.has(projectId)) return;
    setApprovingIds((prev) => {
      const next = new Set(prev);
      next.add(projectId);
      return next;
    });
    // Optimistic flip — assume Leo approver via cockpit-ui client.
    const optimistic: ApprovalPayload = {
      approver: "Leo",
      approved_at: new Date().toISOString(),
      sentinel_path: "(pending)",
    };
    setApprovalOverrides((prev) => {
      const next = new Map(prev);
      next.set(projectId, optimistic);
      return next;
    });
    try {
      const res = await fetch(apiUrl("/api/kaiju/control-tower/approve"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, approver: "Leo", client: "cockpit-ui" }),
      });
      const result = (await res.json()) as ApproveResult;
      if (res.ok && result.status === "approved") {
        setApprovalOverrides((prev) => {
          const next = new Map(prev);
          next.set(projectId, {
            approver: "Leo",
            approved_at: result.approved_at,
            sentinel_path: result.sentinel_path,
          });
          return next;
        });
        setToast({ kind: "ok", msg: `✅ อนุมัติแล้ว — ${projectName}` });
      } else if (res.ok && result.status === "already_approved_by_you") {
        setApprovalOverrides((prev) => {
          const next = new Map(prev);
          next.set(projectId, {
            approver: result.original_approver,
            approved_at: result.approved_at,
            sentinel_path: result.sentinel_path,
          });
          return next;
        });
        setToast({ kind: "info", msg: `✅ อนุมัติแล้วก่อนหน้านี้ (${formatRelativeTs(result.approved_at)})` });
      } else if (result.status === "approver_mismatch") {
        // Someone else already approved — surface their identity, revert optimistic Leo.
        setApprovalOverrides((prev) => {
          const next = new Map(prev);
          next.set(projectId, {
            approver: result.original_approver,
            approved_at: result.approved_at,
            sentinel_path: result.sentinel_path,
          });
          return next;
        });
        setToast({ kind: "info", msg: `อนุมัติโดย ${result.original_approver} ไปแล้ว` });
      } else {
        // Revert optimistic — error path.
        setApprovalOverrides((prev) => {
          const next = new Map(prev);
          next.delete(projectId);
          return next;
        });
        const msg =
          result.status === "project_not_found" ? `ไม่พบ project: ${result.project_id}`
          : result.status === "approver_not_allowed" ? `Approver "${result.approver}" ไม่อยู่ใน allowed list`
          : result.status === "client_not_allowed" ? `Client "${result.client}" ไม่อยู่ใน allowed list`
          : result.status === "lock_timeout" ? "ระบบไม่พร้อม (file-lock timeout) — ลองใหม่"
          : "ไม่สำเร็จ";
        setToast({ kind: "err", msg });
      }
    } catch {
      // Network / 5xx — revert and toast a soft retry hint.
      setApprovalOverrides((prev) => {
        const next = new Map(prev);
        next.delete(projectId);
        return next;
      });
      setToast({ kind: "err", msg: "ระบบไม่พร้อม — ลองใหม่ในไม่กี่วินาที" });
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [approvingIds]);

  // Auto-dismiss toast after 4s.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const selectedAgent = profiles.find((agent) => agent.id === selectedAgentId) ?? profiles[0];
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId) ?? issues[0];
  const liveAgent = selectedAgent ? matchLiveAgent(selectedAgent, agents) : undefined;
  const activeRuns = runs.filter((run) => run.status === "running" || run.status === "queued");
  const pendingApprovals = approvalRequests.filter((approval) => approval.decision === "pending");
  const pendingDecisionBriefs = decisionQueue?.briefs?.filter(isOpenDecisionBrief) ?? [];
  const blockedIssues = issues.filter((issue) => issue.status === "blocked");
  const activeIssues = issues.filter((issue) => !["done", "cancelled"].includes(issue.status));
  const totalSpend = budgets.reduce((sum, budget) => sum + (budget.observedUsd || 0), 0) + runs.reduce((sum, run) => sum + (run.costUsd || 0), 0);

  const tabCounts: Partial<Record<TabKey, number>> = {
    "project-room": missionRooms.length,
    inbox: pendingApprovals.length + legacyApprovals.length + pendingDecisionBriefs.length,
    issues: activeIssues.length,
    routines: routines.filter((routine) => routine.status === "active").length,
    agents: profiles.length,
    costs: budgets.filter((budget) => budget.status !== "ok").length,
    activity: activeRuns.length,
  };

  async function runAction<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
    setBusyAction(label);
    setError("");
    try {
      const result = await action();
      await refresh();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1920px]">
        <ControlSidebar
          company={company}
          tabs={TABS}
          tab={tab}
          counts={tabCounts}
          connected={connected}
          onSelect={setTab}
        />

        <section className="min-w-0 flex-1">
          <HeaderBar
            company={company}
            connected={connected}
            stats={{
              agents: profiles.length,
              live: agents.length,
              issues: activeIssues.length,
              approvals: pendingApprovals.length + pendingDecisionBriefs.length,
              runs: activeRuns.length,
              spend: totalSpend,
            }}
            busy={busyAction}
            onRefresh={refresh}
            onNewIssue={() => setModal("issue")}
            onNewAgent={() => setModal("agent")}
          />

          {error && (
            <div className="mx-4 mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <SchemaVersionBanner state={schemaState} />

          <div className="px-4 py-4 lg:px-6">
            {tab === "dashboard" && (
              <DashboardTab
                stewardRows={stewardRows}
                approvalIndex={approvalIndex}
                approvingIds={approvingIds}
                onApprove={onApprove}
                connected={connected}
                company={company}
                agents={agents}
                profiles={profiles}
                issues={issues}
                approvals={pendingApprovals}
                runs={runs}
                budgets={budgets}
                workMap={workMap}
                decisionQueue={decisionQueue}
                runnerSync={runnerSync}
                metrics={{
                  commerce: data.commerce ?? [],
                  operations: data.operations ?? [],
                  finance: data.finance ?? [],
                  content: data.content ?? [],
                }}
                onOpenAgent={(id) => { setSelectedAgentId(id); setTab("agents"); }}
                onOpenIssue={(id) => { setSelectedIssueId(id); setTab("issues"); }}
                onResumeRun={(id) => runAction(`resume-run-${id}`, () => apiRequest(`/runs/${id}/supervisor-resume`, {
                  method: "POST",
                  body: JSON.stringify({ requestedBy: "Control Tower" }),
                }))}
                onRequestReview={(id) => runAction(`review-run-${id}`, () => apiRequest(`/runs/${id}/supervisor-review`, {
                  method: "POST",
                  body: JSON.stringify({ requestedBy: "Control Tower" }),
                }))}
                onDecisionAction={(id, status, decisionComment, selectedOptionId) => runAction(`decision-${id}`, () => apiRequest(`/decision-queue/briefs/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    status,
                    decidedBy: "Leo/Amy",
                    updatedBy: "Control Tower",
                    decisionComment: decisionComment?.trim() || undefined,
                    selectedOptionId,
                  }),
                }))}
                busy={busyAction}
              />
            )}

            {tab === "project-room" && (
              <ProjectOperatingRoom
                projects={projects}
                issues={issues}
                approvals={approvalRequests}
                runs={runs}
                agents={profiles}
                missionRooms={missionRooms}
                tokenLedgers={tokenLedgers}
                oracleBridge={oracleBridge}
                onOpenIssue={(id) => { setSelectedIssueId(id); setTab("issues"); }}
                onOpenAgent={(id) => { setSelectedAgentId(id); setTab("agents"); }}
              />
            )}

            {tab === "inbox" && (
              <InboxTab
                approvals={approvalRequests}
                decisionQueue={decisionQueue}
                legacyApprovals={legacyApprovals}
                busy={busyAction}
                onDecision={(id, decision, decisionComment) => runAction(`approval-${id}`, () => apiRequest(`/approvals/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    decision,
                    decidedBy: "Leo",
                    decisionComment: decisionComment?.trim() || undefined,
                  }),
                }))}
                onDecisionBrief={(id, status, decisionComment, selectedOptionId) => runAction(`decision-${id}`, () => apiRequest(`/decision-queue/briefs/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    status,
                    decidedBy: "Leo/Amy",
                    updatedBy: "Control Tower Inbox",
                    decisionComment: decisionComment?.trim() || undefined,
                    selectedOptionId,
                  }),
                }))}
              />
            )}

            {tab === "issues" && (
              <IssuesTab
                issues={issues}
                projects={projects}
                agents={profiles}
                selectedIssue={selectedIssue}
                view={issueView}
                onView={setIssueView}
                onNewIssue={() => setModal("issue")}
                onSelectIssue={setSelectedIssueId}
                onPatchIssue={(id, patch) => runAction(`issue-${id}`, () => apiRequest(`/issues/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ ...patch, updatedBy: "Control Tower" }),
                }))}
                onQueueRun={(issue) => runAction(`run-${issue.id}`, () => apiRequest("/runs", {
                  method: "POST",
                  body: JSON.stringify({
                    issueId: issue.id,
                    agentId: issue.assigneeId || "david",
                    trigger: "manual",
                    summary: `Queued run for ${issue.title}`,
                  }),
                }))}
              />
            )}

            {tab === "routines" && (
              <RoutinesTab
                routines={routines}
                onNewRoutine={() => setModal("routine")}
                onPatchRoutine={(id, patch) => runAction(`routine-${id}`, () => apiRequest(`/routines/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ ...patch, updatedBy: "Control Tower" }),
                }))}
              />
            )}

            {tab === "goals" && (
              <GoalsTab projects={projects} tasks={tasks} onOpenIssue={(id) => { setSelectedIssueId(id); setTab("issues"); }} />
            )}

            {tab === "org" && (
              <OrgTab profiles={profiles} agents={agents} onOpenAgent={(id) => { setSelectedAgentId(id); setTab("agents"); }} />
            )}

            {tab === "agents" && (
              <AgentsTab
                profiles={profiles}
                runtimeAgents={agents}
                selected={selectedAgent}
                liveAgent={liveAgent}
                issues={issues}
                runs={runs}
                budgets={budgets}
                secrets={secrets}
                skills={skills}
                onSelect={setSelectedAgentId}
                onOpenTerminal={onSelectAgent}
                onNewAgent={() => setModal("agent")}
                onHeartbeat={(id) => runAction(`heartbeat-${id}`, () => apiRequest(`/agents/${id}/heartbeat`, { method: "POST" }))}
                onPause={(id) => runAction(`pause-${id}`, () => apiRequest(`/agents/${id}/pause`, { method: "POST" }))}
                onResume={(id) => runAction(`resume-${id}`, () => apiRequest(`/agents/${id}/resume`, { method: "POST" }))}
                onPatchAgent={(id, patch) => runAction(`agent-${id}`, () => apiRequest(`/agents/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ ...patch, updatedBy: "Control Tower" }),
                }))}
                onGrantSecret={(secretId, agentId) => runAction(`grant-${secretId}`, () => apiRequest(`/secrets/${secretId}/grant`, {
                  method: "POST",
                  body: JSON.stringify({ agentId, requestedBy: "Control Tower" }),
                }))}
              />
            )}

            {tab === "skills" && (
              <SkillsTab
                skills={skills}
                agents={profiles}
                onPromote={(id) => runAction(`skill-${id}`, () => apiRequest(`/skills/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ lifecycle: "live", updatedBy: "Control Tower" }),
                }))}
              />
            )}

            {tab === "costs" && (
              <CostsTab budgets={budgets} runs={runs} agents={profiles} onNewBudget={() => setModal("budget")} />
            )}

            {tab === "activity" && (
              <ActivityTab activity={activity} runs={runs} sources={sources} />
            )}

            {tab === "settings" && (
              <SettingsTab
                company={company}
                sources={sources}
                secrets={secrets}
                onNewSecret={() => setModal("secret")}
                onPatchCompany={(patch) => runAction("company", () => apiRequest("/company", {
                  method: "PATCH",
                  body: JSON.stringify({ ...patch, updatedBy: "Control Tower" }),
                }))}
              />
            )}
          </div>
        </section>
      </div>

      {modal === "issue" && (
        <IssueModal
          agents={profiles}
          projects={projects}
          onClose={() => setModal(null)}
          onCreate={(body) => runAction("create-issue", () => apiRequest<ControlTowerIssue>("/issues", {
            method: "POST",
            body: JSON.stringify(body),
          })).then((issue) => {
            if (issue) {
              setSelectedIssueId(issue.id);
              setTab("issues");
              setModal(null);
            }
          })}
        />
      )}

      {modal === "agent" && (
        <AgentModal
          agents={profiles}
          onClose={() => setModal(null)}
          onCreate={(body) => runAction("create-agent", () => apiRequest<{ agent: AgentProfile }>("/agents", {
            method: "POST",
            body: JSON.stringify(body),
          })).then((result) => {
            if (result?.agent) {
              setSelectedAgentId(result.agent.id);
              setTab("agents");
              setModal(null);
            }
          })}
        />
      )}

      {modal === "routine" && (
        <RoutineModal
          agents={profiles}
          projects={projects}
          onClose={() => setModal(null)}
          onCreate={(body) => runAction("create-routine", () => apiRequest("/routines", {
            method: "POST",
            body: JSON.stringify(body),
          })).then((result) => {
            if (result) {
              setTab("routines");
              setModal(null);
            }
          })}
        />
      )}

      {modal === "secret" && (
        <SecretModal
          onClose={() => setModal(null)}
          onCreate={(body) => runAction("create-secret", () => apiRequest("/secrets", {
            method: "POST",
            body: JSON.stringify(body),
          })).then((result) => {
            if (result) {
              setTab("settings");
              setModal(null);
            }
          })}
        />
      )}

      {modal === "budget" && (
        <BudgetModal
          agents={profiles}
          projects={projects}
          onClose={() => setModal(null)}
          onCreate={(body) => runAction("create-budget", () => apiRequest("/budgets", {
            method: "POST",
            body: JSON.stringify(body),
          })).then((result) => {
            if (result) {
              setTab("costs");
              setModal(null);
            }
          })}
        />
      )}
      {toast && <Toast kind={toast.kind} msg={toast.msg} onDismiss={() => setToast(null)} />}
    </main>
  );
}

function SchemaVersionBanner({ state }: { state: SchemaVersionState }) {
  if (state.kind === "match" || state.kind === "missing" || state.kind === "patch-mismatch") return null;
  const isMajor = state.kind === "major-mismatch";
  const tone = isMajor ? "border-red-400/40 bg-red-500/10 text-red-100" : "border-amber-300/30 bg-amber-300/10 text-amber-100";
  const prefix = isMajor ? "⚠ Schema major mismatch" : "ℹ Schema minor mismatch";
  return (
    <div role="status" aria-live="polite" className={`mx-4 mt-3 rounded-lg border px-4 py-2 text-xs ${tone}`}>
      {prefix}: API <code>{state.got}</code> vs UI <code>{state.expected}</code>.
      {isMajor ? " Cockpit running in degraded mode — refresh after redeploy." : " Some fields may be missing; refresh tolerated."}
    </div>
  );
}

function Toast({ kind, msg, onDismiss }: { kind: "ok" | "err" | "info"; msg: string; onDismiss: () => void }) {
  const tone =
    kind === "ok" ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
    : kind === "err" ? "border-red-400/40 bg-red-500/15 text-red-100"
    : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100";
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 right-6 z-50">
      <button
        type="button"
        onClick={onDismiss}
        className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm transition hover:opacity-90 ${tone}`}
      >
        {msg}
      </button>
    </div>
  );
}

function ControlSidebar({ company, tabs, tab, counts, connected, onSelect }: {
  company?: CompanyProfile;
  tabs: Array<{ key: TabKey; label: string }>;
  tab: TabKey;
  counts: Partial<Record<TabKey, number>>;
  connected: boolean;
  onSelect: (tab: TabKey) => void;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[286px] shrink-0 border-r border-white/[0.08] bg-[#080a12] px-4 py-4 lg:block">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-[#141726] text-lg font-bold" style={{ color: company?.brandColor || "#8b8cff" }}>
          {(company?.name || "K").slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-white">{company?.name || "Kaiju AI Office"}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-white/35">
            <span className="h-2 w-2 rounded-full" style={{ background: connected ? "#22c55e" : "#ef4444" }} />
            <span>{connected ? "live" : "offline"}</span>
          </div>
        </div>
      </div>

      <nav className="space-y-1">
        {tabs.map((item) => {
          const active = item.key === tab;
          const count = counts[item.key];
          return (
            <button
              key={item.key}
              className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:border-white/20"
              style={{
                background: active ? "rgba(255,255,255,0.075)" : "transparent",
                borderColor: active ? "rgba(125,211,252,0.32)" : "transparent",
              }}
              onClick={() => onSelect(item.key)}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: active ? "#67e8f9" : "rgba(255,255,255,0.22)" }} />
              <span className="flex-1 text-sm font-medium text-white/78">{item.label}</span>
              {typeof count === "number" && count > 0 && (
                <span className="rounded border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/50">{count}</span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function HeaderBar({ company, connected, stats, busy, onRefresh, onNewIssue, onNewAgent }: {
  company?: CompanyProfile;
  connected: boolean;
  stats: { agents: number; live: number; issues: number; approvals: number; runs: number; spend: number };
  busy: string;
  onRefresh: () => void;
  onNewIssue: () => void;
  onNewAgent: () => void;
}) {
  return (
    <header className="border-b border-white/[0.08] bg-[#05070d]/95 px-4 py-4 lg:px-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[2.4px] text-cyan-200/55">Kaiju Control Tower</div>
          <h1 className="mt-1 truncate text-2xl font-semibold text-white">{company?.mission || "Approval-gated AI office"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TopPill label="Agents" value={`${stats.agents}`} tone="ok" />
          <TopPill label="Live" value={`${stats.live}`} tone={connected ? "ok" : "blocked"} />
          <TopPill label="Issues" value={`${stats.issues}`} tone={stats.issues > 0 ? "watch" : "ok"} />
          <TopPill label="Approvals" value={`${stats.approvals}`} tone={stats.approvals > 0 ? "watch" : "ok"} />
          <TopPill label="Runs" value={`${stats.runs}`} tone={stats.runs > 0 ? "watch" : "ok"} />
          <TopPill label="Spend" value={compactMoney(stats.spend)} tone="ok" />
          <button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition hover:border-white/25" onClick={onRefresh}>
            {busy ? "Working..." : "Refresh"}
          </button>
          <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-200/55" onClick={onNewIssue}>
            + New Issue
          </button>
          <button className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-200/55" onClick={onNewAgent}>
            + Hire Agent
          </button>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0b0f18]">
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-end lg:justify-between lg:px-5">
          <div className="min-w-0 max-w-4xl">
            <div className="text-[11px] font-medium uppercase tracking-[2px] text-emerald-200/65">ศูนย์บัญชาการ Kaiju AI Office</div>
            <div className="mt-2 text-2xl font-semibold leading-tight text-white md:text-3xl">บริษัท AI ที่ทำงานเองได้ แต่ทุกอำนาจสำคัญยังผ่าน Leo, Amy และ HELM</div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
              Control Tower รวมภารกิจ เอเจนต์ งาน อนุมัติ รัน เครื่องมือ ความลับ งบประมาณ และบันทึกกิจกรรมไว้ในที่เดียว โดยใช้ David Oracle เป็นสมองและแหล่งความจริงของระบบ
            </p>
          </div>
          <div className="grid min-w-[240px] grid-cols-2 gap-2 text-sm">
            <ThaiCoverStat label="สถานะระบบ" value={connected ? "ออนไลน์" : "ออฟไลน์"} tone={connected ? "ok" : "blocked"} />
            <ThaiCoverStat label="โหมดอำนาจ" value="อนุมัติก่อน" tone="ok" />
            <ThaiCoverStat label="งานเปิด" value={`${stats.issues}`} tone={stats.issues > 0 ? "watch" : "ok"} />
            <ThaiCoverStat label="รออนุมัติ" value={`${stats.approvals}`} tone={stats.approvals > 0 ? "watch" : "ok"} />
          </div>
        </div>
      </div>
    </header>
  );
}

function ThaiCoverStat({ label, value, tone }: { label: string; value: string; tone: ControlTowerHealth }) {
  const color = healthColor(tone);
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2">
      <div className="text-[11px] text-white/38">{label}</div>
      <div className="mt-1 font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function TopPill({ label, value, tone }: { label: string; value: string; tone: ControlTowerHealth }) {
  const color = healthColor(tone);
  return (
    <div className="min-w-[86px] rounded-lg border px-3 py-2" style={{ borderColor: `${color}33`, background: "#0b0d14" }}>
      <div className="text-[10px] uppercase tracking-[1.5px] text-white/32">{label}</div>
      <div className="mt-1 text-base font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function StewardLogPanel({ rows, approvalIndex, approvingIds, onApprove }: {
  rows: StewardRow[];
  approvalIndex: Map<string, ApprovalPayload | null> | null;
  approvingIds: Set<string>;
  onApprove: (projectId: string, projectName: string) => Promise<void>;
}) {
  const showApprovalCol = approvalIndex !== null;
  return (
    <section className="rounded-lg border border-cyan-300/20 bg-[#0b1220] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <SectionHeader
            title="Steward Log — Active Projects"
            meta={rows.length === 0 ? "ยังไม่ wire (รอ FORGE F2)" : `${rows.length} active rows`}
          />
        </div>
        <div className="text-[10px] uppercase tracking-[1.5px] text-white/35">
          source: ψ/memory/david/active-projects.md
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-md border border-amber-300/20 bg-amber-300/5 px-3 py-3 text-xs text-amber-100/70">
          ยังไม่มี Steward log feed — UI พร้อม render ทันทีที่ FORGE ship F2 endpoint
          (รองรับ payload key: <code>stewardRows</code> / <code>steward.rows</code> / <code>stewardLog.rows</code>).
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[1.5px] text-white/45">
                <th className="px-2 py-2 font-medium">Project</th>
                <th className="px-2 py-2 font-medium">Received from</th>
                <th className="px-2 py-2 font-medium">Current owner</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Why (purpose)</th>
                <th className="px-2 py-2 font-medium">Drift check</th>
                {showApprovalCol && <th className="px-2 py-2 font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-white/[0.04] align-top hover:bg-white/[0.015]">
                  <td className="px-2 py-3 text-white/85">
                    <div className="text-xs uppercase tracking-[0.5px] text-white/35">#{row.row_number}</div>
                    <div className="font-semibold">{row.project_name}</div>
                  </td>
                  <td className="px-2 py-3 text-white/65">{row.received_from ?? "—"}</td>
                  <td className="px-2 py-3 font-medium text-white/80">{row.current_owner ?? "—"}</td>
                  <td className="px-2 py-3">
                    <span
                      className="rounded border px-2 py-1 text-[11px] font-medium"
                      style={{
                        color: STEWARD_STATUS_COLOR[row.status],
                        borderColor: `${STEWARD_STATUS_COLOR[row.status]}55`,
                        background: `${STEWARD_STATUS_COLOR[row.status]}15`,
                      }}
                    >
                      {STEWARD_STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-sm leading-5 text-white/75">
                    {row.why ?? <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-2 py-3 text-xs">
                    {row.drift_check
                      ? <span className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2 py-1 text-emerald-100">{row.drift_check}</span>
                      : <span className="text-white/30">—</span>}
                  </td>
                  {showApprovalCol && (
                    <td className="px-2 py-3">
                      <ApprovalCell
                        projectId={row.id}
                        projectName={row.project_name}
                        approval={approvalIndex.get(row.id) ?? null}
                        pending={approvingIds.has(row.id)}
                        onApprove={onApprove}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApprovalCell({ projectId, projectName, approval, pending, onApprove }: {
  projectId: string;
  projectName: string;
  approval: ApprovalPayload | null;
  pending: boolean;
  onApprove: (projectId: string, projectName: string) => Promise<void>;
}) {
  if (approval) {
    const absoluteTs = approval.approved_at;
    return (
      <span
        title={`Approved by ${approval.approver} at ${absoluteTs}`}
        className="inline-flex items-center gap-1 rounded border border-emerald-300/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-100"
      >
        <span aria-hidden>✅</span>
        Approved · {approval.approver} · {formatRelativeTs(absoluteTs)}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => { void onApprove(projectId, projectName); }}
      aria-label={`Approve ${projectName}`}
      className="inline-flex items-center gap-1 rounded border border-emerald-300/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-100 transition hover:border-emerald-200/55 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "อนุมัติ..." : "Approve"}
    </button>
  );
}

function DashboardTab({ connected, company, agents, profiles, issues, approvals, runs, budgets, workMap, decisionQueue, runnerSync, metrics, stewardRows, approvalIndex, approvingIds, onApprove, onOpenAgent, onOpenIssue, onResumeRun, onRequestReview, onDecisionAction, busy }: {
  connected: boolean;
  company?: CompanyProfile;
  agents: AgentState[];
  profiles: AgentProfile[];
  issues: ControlTowerIssue[];
  approvals: ApprovalRequest[];
  runs: RunRecord[];
  budgets: BudgetPolicy[];
  workMap?: ControlTowerPayload["workMap"];
  decisionQueue?: DecisionQueueSnapshot;
  runnerSync?: OracleRunnerSyncSnapshot;
  metrics: Record<"commerce" | "operations" | "finance" | "content", BusinessMetric[]>;
  stewardRows: StewardRow[];
  approvalIndex: Map<string, ApprovalPayload | null> | null;
  approvingIds: Set<string>;
  onApprove: (projectId: string, projectName: string) => Promise<void>;
  onOpenAgent: (id: string) => void;
  onOpenIssue: (id: string) => void;
  onResumeRun: (id: string) => void;
  onRequestReview: (id: string) => void;
  onDecisionAction: (id: string, status: DecisionBriefActionStatus, decisionComment?: string, selectedOptionId?: string) => void;
  busy: string;
}) {
  const liveByProfile = new Map(profiles.map((profile) => [profile.id, matchLiveAgent(profile, agents)]));
  const activeRuns = runs.filter((run) => run.status === "queued" || run.status === "running");
  const companyBudget = budgets.find((budget) => budget.scope === "company");
  const openIssues = issues.filter((issue) => !["done", "cancelled"].includes(issue.status));
  const dashboardWorkMap = decisionQueue
    ? ({ ...(workMap ?? {}), decisionQueue } as ControlTowerPayload["workMap"])
    : workMap;

  return (
    <div className="space-y-4">
      <StewardLogPanel rows={stewardRows} approvalIndex={approvalIndex} approvingIds={approvingIds} onApprove={onApprove} />

      <WorkOrganizationOverview
        workMap={dashboardWorkMap}
        onDecisionAction={onDecisionAction}
        busyDecisionId={busy.startsWith("decision-") ? busy.replace("decision-", "") : ""}
      />

      <ContinuitySyncPanel runnerSync={runnerSync} runs={runs} issues={issues} busy={busy} onOpenIssue={onOpenIssue} onResumeRun={onResumeRun} onRequestReview={onRequestReview} />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SignalTile label="Agent feed" value={connected ? "Live" : "Offline"} health={connected ? "ok" : "blocked"} source={`${agents.length} runtime windows`} />
        <SignalTile label="Approval mode" value={company?.approvalMode === "approval_gated" ? "Gated" : "Unknown"} health="ok" source={`${approvals.length} pending`} />
        <SignalTile label="Issue load" value={`${openIssues.length} open`} health={openIssues.some((issue) => issue.status === "blocked") ? "blocked" : openIssues.length > 0 ? "watch" : "ok"} source={`${issues.length} total`} />
        <SignalTile label="Budget" value={companyBudget ? compactMoney(companyBudget.limitUsd) : "No cap"} health={companyBudget?.status ?? "ok"} source={companyBudget ? `${companyBudget.mode} stop` : "soft default"} />
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          <SectionHeader title="Live Runs" meta={`${activeRuns.length} active`} />
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
            {activeRuns.length === 0 ? (
              <EmptyPanel label="No live runs" />
            ) : activeRuns.slice(0, 6).map((run) => (
              <RunCard
                key={run.id}
                run={run}
                busy={busy === `resume-run-${run.id}` || busy === `review-run-${run.id}`}
                onResumeRun={onResumeRun}
                onRequestReview={onRequestReview}
              />
            ))}
          </div>

          <SectionHeader title="Business Signals" meta="source-backed" />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
            {Object.entries(metrics).map(([family, items]) => (
              <MetricFamily key={family} label={family} metrics={items} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeader title="Agent Board" meta={`${profiles.length} profiles`} />
          <div className="grid grid-cols-1 gap-2">
            {profiles.slice(0, 8).map((profile) => {
              const live = liveByProfile.get(profile.id);
              return (
                <button key={profile.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-3 text-left transition hover:border-cyan-200/30" onClick={() => onOpenAgent(profile.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: live ? runtimeStatusColor(live.status) : statusColor(profile.lifecycle) }} />
                      <span className="truncate text-sm font-semibold text-white/85">{profile.name}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(profile.lifecycle) }}>{profile.lifecycle}</span>
                  </div>
                  <div className="mt-2 truncate text-xs text-white/38">{profile.title}</div>
                </button>
              );
            })}
          </div>

          <SectionHeader title="Recent Issues" meta={`${openIssues.length} open`} />
          <div className="space-y-2">
            {openIssues.slice(0, 5).map((issue) => (
              <IssueListRow key={issue.id} issue={issue} onSelect={() => onOpenIssue(issue.id)} />
            ))}
            {openIssues.length === 0 && <EmptyPanel label="No open issues" />}
          </div>
        </div>
      </section>
    </div>
  );
}

function ContinuitySyncPanel({ runnerSync, runs, issues, busy, onOpenIssue, onResumeRun, onRequestReview }: {
  runnerSync?: OracleRunnerSyncSnapshot;
  runs: RunRecord[];
  issues: ControlTowerIssue[];
  busy: string;
  onOpenIssue: (id: string) => void;
  onResumeRun: (id: string) => void;
  onRequestReview: (id: string) => void;
}) {
  const signals = runnerSync?.signals ?? [];
  const supervisorSignals = signals.filter((signal) => signal.supervisorState && !["ok", "done"].includes(signal.supervisorState));
  const health: ControlTowerHealth = !runnerSync
    ? "missing"
    : (runnerSync.needsOperatorChoice ?? 0) > 0 || runnerSync.stale > 0 || signals.some((signal) => signal.state === "blocked" || signal.supervisorState === "blocked")
      ? "blocked"
      : (runnerSync.needsSupervisor ?? 0) > 0 || runnerSync.changed > 0 || signals.some((signal) => signal.state === "handoff_ready" || signal.state === "review_ready")
        ? "watch"
        : "ok";
  const color = healthColor(health);
  const checkedAt = runnerSync?.checkedAt ? formatDate(runnerSync.checkedAt) : "ยังไม่เคย sync";
  const flowSupervisor = runnerSync?.flowSupervisor;
  const flowSupervisorEvents = (flowSupervisor?.recentEvents ?? []).slice(-3).reverse();
  const flowSupervisorCheckedAt = flowSupervisor?.generatedAt ? formatDate(String(flowSupervisor.generatedAt)) : "ยังไม่มี sweep";
  const flowSupervisorStaleCount = flowSupervisor?.staleRuns?.length ?? 0;

  return (
    <section className="rounded-lg border bg-white/[0.025] p-4" style={{ borderColor: `${color}35` }}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[2px]" style={{ color }}>Continuity Sync</div>
          <h2 className="mt-1 text-lg font-semibold text-white">Oracle run reconciler: กันงานค้างระหว่าง approve, issue, run และไฟล์จริง</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
            Control Tower อ่านหลักฐานจาก David Oracle แล้ว sync สถานะกลับเข้า run/issue อัตโนมัติ และแยกงานที่ต้องให้ Supervisor รับไม้ต่อ เช่น handoff, context boundary, หรือ agent prompt ที่ยังไม่ใช่งานวิ่งจริง.
          </p>
        </div>
        <div className="grid min-w-[420px] grid-cols-3 gap-2 xl:grid-cols-6">
          <ThaiCoverStat label="ตรวจ run" value={`${runnerSync?.checked ?? 0}`} tone={health} />
          <ThaiCoverStat label="เปลี่ยนสถานะ" value={`${runnerSync?.changed ?? 0}`} tone={runnerSync?.changed ? "watch" : "ok"} />
          <ThaiCoverStat label="stale" value={`${runnerSync?.stale ?? 0}`} tone={runnerSync?.stale ? "blocked" : "ok"} />
          <ThaiCoverStat label="supervisor" value={`${runnerSync?.needsSupervisor ?? 0}`} tone={runnerSync?.needsSupervisor ? "watch" : "ok"} />
          <ThaiCoverStat label="resume" value={`${runnerSync?.needsResume ?? 0}`} tone={runnerSync?.needsResume ? "watch" : "ok"} />
          <ThaiCoverStat label="choice" value={`${runnerSync?.needsOperatorChoice ?? 0}`} tone={runnerSync?.needsOperatorChoice ? "blocked" : "ok"} />
        </div>
      </div>
      <div className="mt-3 text-xs text-white/35">Last check: {checkedAt}</div>
      <div className="mt-2 rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-xs leading-5 text-white/50">
        Flow Supervisor: ตรวจล่าสุด {flowSupervisorCheckedAt} | active {flowSupervisor?.activeRuns ?? 0} | stale {flowSupervisorStaleCount}
        {flowSupervisor?.lifecyclePath && <span className="ml-2 text-cyan-200/50">{flowSupervisor.lifecyclePath}</span>}
      </div>
      {flowSupervisorEvents.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-3">
          {flowSupervisorEvents.map((event, index) => (
            <div key={`${String(event.runId || "event")}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-cyan-100/65">
                {String(event.agentId || "agent")} | {String(event.eventType || "event")}
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{String(event.summary || "No summary")}</div>
              {event.timestamp && <div className="mt-1 text-[10px] text-white/32">{formatDate(String(event.timestamp))}</div>}
            </div>
          ))}
        </div>
      )}
      {supervisorSignals.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.045] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[1.4px] text-amber-200">Supervisor Queue</div>
          <div className="mt-1 text-xs leading-5 text-white/58">
            มี {supervisorSignals.length} run ที่ไม่ควรถูกมองว่าเดินเองปกติ ต้อง resume, review, หรือให้ owner ตัดสินใจก่อนทำต่อ
          </div>
        </div>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
        {signals.length === 0 ? (
          <EmptyPanel label="No Oracle sync signals yet" compact />
        ) : signals.slice(0, 4).map((signal) => {
          const run = runs.find((item) => item.id === signal.runId);
          const issue = issues.find((item) => item.id === signal.issueId);
          const supervisorOpen = signal.supervisorState && !["ok", "done"].includes(signal.supervisorState);
          const signalColor = supervisorOpen
            ? healthColor(signal.supervisorSeverity || "watch")
            : statusColor(signal.state === "handoff_ready" || signal.state === "review_ready" ? "review" : signal.status);
          const badge = supervisorOpen ? signal.supervisorState : signal.state;
          return (
            <div
              key={`${signal.runId}-${signal.state}`}
              className="rounded-lg border bg-black/20 px-3 py-3"
              style={{ borderColor: `${signalColor}36` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white/85">{issue?.title || run?.summary || signal.runId}</div>
                  <div className="mt-1 text-xs text-white/38">{run?.agentName || signal.agentId} | {signal.runId}</div>
                </div>
                <span className="shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-[1px]" style={{ borderColor: `${signalColor}55`, color: signalColor }}>
                  {badge}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/55">{signal.supervisorReason || signal.reason}</p>
              {signal.supervisorNextAction && <p className="mt-1 text-xs leading-5 text-cyan-100/55">Next: {signal.supervisorNextAction}</p>}
              {signal.artifactPath && <div className="mt-2 truncate text-[11px] text-cyan-200/55">{signal.artifactPath}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {signal.issueId && (
                  <button
                    className="rounded border border-cyan-200/25 bg-cyan-200/[0.08] px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:border-cyan-100/50"
                    onClick={() => onOpenIssue(signal.issueId || "")}
                  >
                    Open issue
                  </button>
                )}
                {signal.supervisorState === "needs_resume" || signal.supervisorState === "needs_operator_choice" ? (
                  <button
                    className="rounded border border-amber-200/30 bg-amber-200/[0.08] px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-100/55 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={busy === `resume-run-${signal.runId}`}
                    onClick={() => onResumeRun(signal.runId)}
                  >
                    {busy === `resume-run-${signal.runId}` ? "Creating..." : "Create resume"}
                  </button>
                ) : null}
                {signal.supervisorState === "needs_review" ? (
                  <button
                    className="rounded border border-emerald-200/30 bg-emerald-200/[0.08] px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-100/55 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={busy === `review-run-${signal.runId}`}
                    onClick={() => onRequestReview(signal.runId)}
                  >
                    {busy === `review-run-${signal.runId}` ? "Queueing..." : "Request review"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InboxTab({ approvals, decisionQueue, legacyApprovals, busy, onDecision, onDecisionBrief }: {
  approvals: ApprovalRequest[];
  decisionQueue?: DecisionQueueSnapshot;
  legacyApprovals: ApprovalItem[];
  busy: string;
  onDecision: (id: string, decision: ApprovalActionDecision, decisionComment?: string) => void;
  onDecisionBrief: (id: string, status: DecisionBriefActionStatus, decisionComment?: string, selectedOptionId?: string) => void;
}) {
  const pending = approvals.filter((approval) => approval.decision === "pending");
  const decided = approvals.filter((approval) => approval.decision !== "pending");
  const decisionBriefs = decisionQueue?.briefs ?? [];
  const openDecisionBriefs = decisionBriefs.filter(isOpenDecisionBrief);
  const closedDecisionBriefs = decisionBriefs.filter((brief) => !isOpenDecisionBrief(brief));

  return (
    <div className="space-y-4">
      <SectionHeader title="CEO Decision Queue" meta={`${openDecisionBriefs.length} waiting`} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {openDecisionBriefs.map((brief) => (
          <DecisionBriefCard
            key={brief.id}
            brief={brief}
            busy={busy === `decision-${brief.id}`}
            onDecision={onDecisionBrief}
          />
        ))}
        {openDecisionBriefs.length === 0 && <EmptyPanel label="No CEO decisions waiting" />}
      </div>

      <SectionHeader title="Approval Queue" meta={`${pending.length} pending`} />
      <div className="space-y-2">
        {pending.map((approval) => (
          <ApprovalRow key={approval.id} approval={approval} busy={busy} onDecision={onDecision} />
        ))}
        {pending.length === 0 && <EmptyPanel label="No pending approvals" />}
      </div>

      {legacyApprovals.length > 0 && (
        <>
          <SectionHeader title="File Queue" meta={`${legacyApprovals.length} file-backed`} />
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {legacyApprovals.map((approval) => (
              <LegacyApprovalCard key={approval.id} approval={approval} />
            ))}
          </div>
        </>
      )}

      <SectionHeader title="Decision Log" meta={`${decided.length + closedDecisionBriefs.length} decided`} />
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
        {closedDecisionBriefs.slice(0, 12).map((brief) => (
          <SimpleRecord
            key={brief.id}
            title={brief.title}
            meta={brief.lastDecisionComment
              ? `${brief.status} by ${brief.decidedBy || brief.decisionOwner} | ${brief.lastDecisionComment}`
              : `${brief.status} by ${brief.decidedBy || brief.decisionOwner}`}
            tone={brief.status === "approved" ? "ok" : brief.status === "rejected" ? "blocked" : "watch"}
          />
        ))}
        {decided.slice(0, 12).map((approval) => (
          <SimpleRecord
            key={approval.id}
            title={approval.title}
            meta={approval.lastDecisionComment
              ? `${approval.decision} by ${approval.decidedBy || "board"} | ${approval.lastDecisionComment}`
              : `${approval.decision} by ${approval.decidedBy || "board"}`}
            tone={approval.decision === "approved" ? "ok" : "blocked"}
          />
        ))}
        {decided.length + closedDecisionBriefs.length === 0 && <EmptyPanel label="No decisions yet" />}
      </div>
    </div>
  );
}

function DecisionBriefCard({ brief, busy, onDecision }: {
  brief: DecisionBrief;
  busy: boolean;
  onDecision: (id: string, status: DecisionBriefActionStatus, decisionComment?: string, selectedOptionId?: string) => void;
}) {
  const [decisionComment, setDecisionComment] = useState("");
  const riskColor = brief.riskLevel === "critical" ? "#fb7185" : brief.riskLevel === "high" ? "#f97316" : brief.riskLevel === "medium" ? "#f59e0b" : "#22c55e";
  const recommended = brief.options?.find((option) => option.id === brief.recommendedOption || option.recommended);
  const choices = brief.options ?? [];
  const defaultOptionId = String(brief.selectedOptionId || recommended?.id || brief.recommendedOption || choices[0]?.id || "");
  const [selectedOptionId, setSelectedOptionId] = useState(defaultOptionId);
  const activeOptionId = selectedOptionId || defaultOptionId;
  const submitDecision = (status: DecisionBriefActionStatus) => {
    onDecision(brief.id, status, decisionComment, activeOptionId || undefined);
    setDecisionComment("");
  };

  return (
    <div className="rounded-lg border bg-white/[0.03] p-4" style={{ borderColor: `${riskColor}38` }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: riskColor }} />
            <h3 className="min-w-0 text-lg font-semibold leading-6 text-white">{brief.title}</h3>
            <span className="rounded border px-2 py-0.5 text-[10px] uppercase tracking-[1px]" style={{ borderColor: `${riskColor}55`, color: riskColor }}>
              {brief.riskLevel}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/35">
            <span>{brief.decisionOwner}</span>
            {brief.sourceRef && <span>{brief.sourceRef}</span>}
            <span>{brief.urgency}</span>
            {(brief.assignedAgentName || brief.assignedAgentId) && <span>Agent: {brief.assignedAgentName || brief.assignedAgentId}</span>}
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-white/65">{brief.plainLanguageQuestion}</p>
          {brief.contextShort && <p className="mt-2 max-w-5xl text-sm leading-6 text-white/45">{brief.contextShort}</p>}
          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            <InfoBox label="ค่าหลักที่เสนอ" value={recommended?.label || brief.recommendedOption || "ให้ทีมสรุปตัวเลือกก่อน"} tone="#67e8f9" />
            <InfoBox label="ทำไมต้องตัดสินใจ" value={brief.whyThisMatters || "ต้องมี owner ตัดสินใจเพื่อไม่ให้ทีมค้าง"} tone="#fbbf24" />
          </div>
          {choices.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
              {choices.map((option) => (
                <DecisionOptionCard
                  key={option.id}
                  option={option}
                  selected={option.id === activeOptionId}
                  recommended={option.id === recommended?.id || option.id === brief.recommendedOption || Boolean(option.recommended)}
                  onSelect={() => setSelectedOptionId(option.id)}
                />
              ))}
            </div>
          )}
          {(brief.impactIfApprove || brief.impactIfReject || brief.impactIfWait) && (
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-white/50 xl:grid-cols-3">
              {brief.impactIfApprove && <InfoBox label="ถ้า approve" value={brief.impactIfApprove} tone="#22c55e" />}
              {brief.impactIfReject && <InfoBox label="ถ้า reject" value={brief.impactIfReject} tone="#fb7185" />}
              {brief.impactIfWait && <InfoBox label="ถ้ารอก่อน" value={brief.impactIfWait} tone="#f59e0b" />}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-white/40">Next: {brief.nextActionAfterDecision}</p>
          {brief.lastDecisionComment && (
            <p className="mt-2 rounded border border-white/[0.07] bg-black/20 px-3 py-2 text-xs leading-5 text-white/48">
              Last note: {brief.lastDecisionComment}
            </p>
          )}
        </div>
        <div className="shrink-0 space-y-2 lg:w-[300px]">
          <div className="rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[1.4px] text-cyan-100/78">
              Decision Brief / Comment
            </div>
            <p className="mt-1 text-xs leading-5 text-white/45">
              บันทึกเหตุผล เงื่อนไข หรือทางเลือกที่เลือกไว้ให้ agent และทีมอ่านต่อได้ทันที
            </p>
            <textarea
              className="mt-2 h-28 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-white/72 outline-none placeholder:text-white/28 focus:border-cyan-200/45"
              placeholder="เช่น approve ตามค่าหลัก แต่ให้ HELM ทำ token cap ก่อนเปิด 24/7"
              value={decisionComment}
              onChange={(event) => setDecisionComment(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DecisionActionButton label="Approve" disabled={busy} tone="#22c55e" onClick={() => submitDecision("approved")} />
            <DecisionActionButton label="Changes" disabled={busy} tone="#f59e0b" onClick={() => submitDecision("request_changes")} />
            <DecisionActionButton label="Defer" disabled={busy} tone="#38bdf8" onClick={() => submitDecision("deferred")} />
            <DecisionActionButton label="Reject" disabled={busy} tone="#fb7185" onClick={() => submitDecision("rejected")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionOptionCard({ option, selected, recommended, onSelect }: {
  option: DecisionBriefOption;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const tone = selected ? "#67e8f9" : "#64748b";
  return (
    <button
      type="button"
      className="rounded-lg border bg-black/20 px-3 py-2 text-left transition hover:bg-white/[0.045]"
      style={{ borderColor: `${tone}${selected ? "70" : "30"}` }}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[1.4px]" style={{ color: tone }}>
            {selected ? "ตัวเลือกที่เลือก" : recommended ? "ตัวเลือกที่แนะนำ" : "ตัวเลือก"}
          </div>
          <div className="mt-1 text-sm font-semibold leading-5 text-white/78">{option.label}</div>
        </div>
        {selected && <span className="shrink-0 rounded border border-cyan-200/30 bg-cyan-200/10 px-2 py-0.5 text-[10px] uppercase tracking-[1px] text-cyan-100">selected</span>}
      </div>
      <div className="mt-2 text-xs leading-5 text-white/55">{option.meaning || option.impact || "เลือกทางนี้แล้วทีมจะใช้เป็นค่าหลักในการทำงานต่อ"}</div>
      {option.example && <div className="mt-2 rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-xs leading-5 text-white/45">ตัวอย่าง: {option.example}</div>}
      {(option.pros?.length || option.cons?.length) && (
        <div className="mt-2 grid grid-cols-1 gap-2 text-xs leading-5 text-white/45 md:grid-cols-2">
          {option.pros?.length ? <div><span className="text-emerald-200/80">ดี:</span> {option.pros.join(", ")}</div> : null}
          {option.cons?.length ? <div><span className="text-rose-200/80">ระวัง:</span> {option.cons.join(", ")}</div> : null}
        </div>
      )}
    </button>
  );
}

function DecisionActionButton({ label, tone, disabled, onClick }: {
  label: string;
  tone: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      className="rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: `${tone}42`, background: `${tone}14`, color: tone }}
      onClick={onClick}
    >
      {disabled ? "Saving" : label}
    </button>
  );
}

function InfoBox({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border bg-black/20 px-3 py-2" style={{ borderColor: `${tone}22` }}>
      <div className="text-[10px] font-semibold uppercase tracking-[1.4px]" style={{ color: tone }}>{label}</div>
      <div className="mt-1 text-xs leading-5 text-white/58">{value}</div>
    </div>
  );
}

function IssuesTab({ issues, projects, agents, selectedIssue, view, onView, onNewIssue, onSelectIssue, onPatchIssue, onQueueRun }: {
  issues: ControlTowerIssue[];
  projects: ProjectItem[];
  agents: AgentProfile[];
  selectedIssue?: ControlTowerIssue;
  view: "kanban" | "list";
  onView: (view: "kanban" | "list") => void;
  onNewIssue: () => void;
  onSelectIssue: (id: string) => void;
  onPatchIssue: (id: string, patch: Partial<ControlTowerIssue>) => void;
  onQueueRun: (issue: ControlTowerIssue) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeader title="Issues" meta={`${issues.length} total`} />
          <div className="flex gap-2">
            <button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70" onClick={() => onView(view === "kanban" ? "list" : "kanban")}>
              {view === "kanban" ? "List" : "Kanban"}
            </button>
            <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-medium text-cyan-100" onClick={onNewIssue}>
              + New Issue
            </button>
          </div>
        </div>

        {view === "kanban" ? (
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1180px] grid-cols-7 gap-3">
              {ISSUE_COLUMNS.map((column) => {
                const columnIssues = issues.filter((issue) => issue.status === column.key);
                return (
                  <div key={column.key} className="min-h-[520px] rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">{column.label}</div>
                      <div className="text-xs text-white/25">{columnIssues.length}</div>
                    </div>
                    <div className="space-y-2">
                      {columnIssues.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          active={selectedIssue?.id === issue.id}
                          onSelect={() => onSelectIssue(issue.id)}
                          onStatus={(status) => onPatchIssue(issue.id, { status })}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.025]">
            {issues.map((issue) => (
              <IssueListRow key={issue.id} issue={issue} onSelect={() => onSelectIssue(issue.id)} />
            ))}
            {issues.length === 0 && <EmptyPanel label="No issues" />}
          </div>
        )}
      </section>

      <IssueDetail
        issue={selectedIssue}
        projects={projects}
        agents={agents}
        onPatchIssue={onPatchIssue}
        onQueueRun={onQueueRun}
      />
    </div>
  );
}

function RoutinesTab({ routines, onNewRoutine, onPatchRoutine }: {
  routines: RoutineRecord[];
  onNewRoutine: () => void;
  onPatchRoutine: (id: string, patch: Partial<RoutineRecord>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader title="Routines" meta={`${routines.length} total`} />
        <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-medium text-cyan-100" onClick={onNewRoutine}>
          + New Routine
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {routines.map((routine) => (
          <div key={routine.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-base font-semibold text-white/85">{routine.title}</h3>
              <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(routine.status) }}>{routine.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/55">{shortText(routine.description)}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/38">
              <span>{routine.schedule}</span>
              <span>{routine.assigneeId || "unassigned"}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded border border-white/10 px-2.5 py-1.5 text-xs text-white/65" onClick={() => onPatchRoutine(routine.id, { status: routine.status === "paused" ? "active" : "paused" })}>
                {routine.status === "paused" ? "Resume" : "Pause"}
              </button>
              {routine.status !== "active" && (
                <button className="rounded border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-100" onClick={() => onPatchRoutine(routine.id, { status: "active" })}>
                  Request Live
                </button>
              )}
            </div>
          </div>
        ))}
        {routines.length === 0 && <EmptyPanel label="No routines" />}
      </div>
    </div>
  );
}

function GoalsTab({ projects, tasks, onOpenIssue }: {
  projects: ProjectItem[];
  tasks: ProjectTask[];
  onOpenIssue: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Goals" meta={`${projects.length} projects`} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {projects.map((project) => {
          const color = healthColor(projectHealth(project));
          const projectTasks = tasks.filter((task) => task.projectId === project.id);
          return (
            <div key={project.id} className="rounded-lg border bg-white/[0.03] p-4" style={{ borderColor: `${color}33` }}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-lg font-semibold text-white">{project.title}</h3>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              </div>
              <div className="mt-2 text-xs uppercase tracking-[1px]" style={{ color }}>{project.status}</div>
              <p className="mt-3 text-sm leading-6 text-white/55">{shortText(project.summary)}</p>
              <div className="mt-4 text-xs text-white/35">{project.owner} | {projectTasks.length} tasks</div>
              {project.nextAction && <div className="mt-3 rounded border border-white/[0.06] bg-black/20 px-3 py-2 text-xs leading-5 text-white/55">{project.nextAction}</div>}
              <div className="mt-4 space-y-2">
                {projectTasks.slice(0, 4).map((task) => (
                  <button key={task.id} className="block w-full rounded border border-white/[0.06] px-3 py-2 text-left text-xs text-white/60 hover:border-white/20" onClick={() => onOpenIssue(task.id)}>
                    {task.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {projects.length === 0 && <EmptyPanel label="No goals" />}
      </div>
    </div>
  );
}

function OrgTab({ profiles, agents, onOpenAgent }: {
  profiles: AgentProfile[];
  agents: AgentState[];
  onOpenAgent: (id: string) => void;
}) {
  const roots = profiles.filter((profile) => !profile.reportsTo);
  const children = (id: string) => profiles.filter((profile) => profile.reportsTo === id);

  return (
    <div className="space-y-4">
      <SectionHeader title="Org Chart" meta={`${profiles.length} profiles`} />
      <div className="overflow-x-auto rounded-lg border border-white/[0.07] bg-white/[0.025] p-8">
        <div className="mx-auto flex min-w-[980px] flex-col items-center gap-8">
          <div className="grid grid-cols-2 gap-4">
            <HumanNode name="Leo" title="CEO / Final Authority" tone="#67e8f9" />
            <HumanNode name="Amy" title="Product / Accounting Reality" tone="#a7f3d0" />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {(roots.length ? roots : profiles.slice(0, 3)).map((profile) => (
              <OrgBranch key={profile.id} profile={profile} children={children(profile.id)} agents={agents} onOpenAgent={onOpenAgent} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentsTab({ profiles, runtimeAgents, selected, liveAgent, issues, runs, budgets, secrets, skills, onSelect, onOpenTerminal, onNewAgent, onHeartbeat, onPause, onResume, onPatchAgent, onGrantSecret }: {
  profiles: AgentProfile[];
  runtimeAgents: AgentState[];
  selected?: AgentProfile;
  liveAgent?: AgentState;
  issues: ControlTowerIssue[];
  runs: RunRecord[];
  budgets: BudgetPolicy[];
  secrets: SecretRef[];
  skills: SkillBinding[];
  onSelect: (id: string) => void;
  onOpenTerminal: (agent: AgentState) => void;
  onNewAgent: () => void;
  onHeartbeat: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onPatchAgent: (id: string, patch: Partial<AgentProfile>) => void;
  onGrantSecret: (secretId: string, agentId: string) => void;
}) {
  const assignedIssues = selected ? issues.filter((issue) => issue.assigneeId === selected.id || issue.assigneeName === selected.name) : [];
  const agentRuns = selected ? runs.filter((run) => run.agentId === selected.id) : [];
  const agentBudget = selected ? budgets.find((budget) => budget.scope === "agent" && budget.targetId === selected.id) : undefined;
  const agentSkills = selected ? skills.filter((skill) => skill.agentIds.includes(selected.id)) : [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeader title="Agents" meta={`${profiles.length} profiles`} />
          <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100" onClick={onNewAgent}>+ Hire</button>
        </div>
        {profiles.map((profile) => {
          const live = matchLiveAgent(profile, runtimeAgents);
          const active = selected?.id === profile.id;
          return (
            <button
              key={profile.id}
              className="w-full rounded-lg border px-3 py-3 text-left transition hover:border-white/20"
              style={{
                background: active ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.025)",
                borderColor: active ? "rgba(125,211,252,0.35)" : "rgba(255,255,255,0.07)",
              }}
              onClick={() => onSelect(profile.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: live ? runtimeStatusColor(live.status) : statusColor(profile.lifecycle) }} />
                  <span className="truncate text-sm font-semibold text-white/85">{profile.name}</span>
                </div>
                <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(profile.lifecycle) }}>{profile.lifecycle}</span>
              </div>
              <div className="mt-2 truncate text-xs text-white/38">{profile.title}</div>
            </button>
          );
        })}
      </section>

      <section className="min-w-0">
        {!selected ? (
          <EmptyPanel label="Select an agent" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: liveAgent ? runtimeStatusColor(liveAgent.status) : statusColor(selected.lifecycle) }} />
                    <h2 className="text-2xl font-semibold text-white">{selected.name}</h2>
                  </div>
                  <div className="mt-2 text-sm text-white/45">{selected.title}</div>
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-white/58">{selected.capabilities}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100" onClick={() => onHeartbeat(selected.id)}>
                    Run Heartbeat
                  </button>
                  {selected.lifecycle === "paused" ? (
                    <button className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100" onClick={() => onResume(selected.id)}>Resume</button>
                  ) : (
                    <button className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100" onClick={() => onPause(selected.id)}>Pause</button>
                  )}
                  {liveAgent && (
                    <button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70" onClick={() => onOpenTerminal(liveAgent)}>
                      Terminal
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                <DetailCell label="Runtime" value={`${selected.adapter} / ${selected.model}`} />
                <DetailCell label="Heartbeat" value={`${selected.heartbeatSec}s`} />
                <DetailCell label="Budget" value={agentBudget ? compactMoney(agentBudget.limitUsd) : compactMoney(selected.budgetUsd)} />
                <DetailCell label="Reports To" value={selected.reportsTo || "Board"} />
                <DetailCell label="Can Assign" value={selected.canAssignTasks ? "yes" : "no"} />
                <DetailCell label="Can Hire" value={selected.canCreateAgents ? "yes" : "no"} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Panel title="Assigned Issues" meta={`${assignedIssues.length}`}>
                <div className="space-y-2">
                  {assignedIssues.map((issue) => <IssueMini key={issue.id} issue={issue} />)}
                  {assignedIssues.length === 0 && <EmptyPanel label="No assigned issues" compact />}
                </div>
              </Panel>
              <Panel title="Runs" meta={`${agentRuns.length}`}>
                <div className="space-y-2">
                  {agentRuns.slice(0, 6).map((run) => <RunMini key={run.id} run={run} />)}
                  {agentRuns.length === 0 && <EmptyPanel label="No runs" compact />}
                </div>
              </Panel>
              <Panel title="Skills" meta={`${agentSkills.length}`}>
                <div className="space-y-2">
                  {agentSkills.map((skill) => <SimpleRecord key={skill.id} title={skill.name} meta={skill.lifecycle} tone={skill.lifecycle === "live" ? "ok" : "watch"} />)}
                  {agentSkills.length === 0 && <EmptyPanel label="No skills" compact />}
                </div>
              </Panel>
            </div>

            <Panel title="Tool Access" meta={`${selected.toolSecretIds.length} grants`}>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
                {secrets.map((secret) => {
                  const granted = selected.toolSecretIds.includes(secret.id);
                  return (
                    <div key={secret.id} className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3">
                      <div className="truncate text-sm font-semibold text-white/82">{secret.key}</div>
                      <div className="mt-1 text-xs text-white/35">{secret.provider} | {granted ? "granted" : "not granted"}</div>
                      {!granted && (
                        <button className="mt-3 rounded border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-100" onClick={() => onGrantSecret(secret.id, selected.id)}>
                          Request Grant
                        </button>
                      )}
                    </div>
                  );
                })}
                {secrets.length === 0 && <EmptyPanel label="No secrets" compact />}
              </div>
            </Panel>

            <Panel title="Configuration" meta="approval-gated">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <NumberField label="Heartbeat sec" value={selected.heartbeatSec} onSubmit={(value) => onPatchAgent(selected.id, { heartbeatSec: value })} />
                <ToggleButton label="Search" value={selected.canUseSearch} onToggle={() => onPatchAgent(selected.id, { canUseSearch: !selected.canUseSearch })} />
                <ToggleButton label="Assign Tasks" value={selected.canAssignTasks} onToggle={() => onPatchAgent(selected.id, { canAssignTasks: !selected.canAssignTasks })} />
                <ToggleButton label="Create Agents" value={selected.canCreateAgents} onToggle={() => onPatchAgent(selected.id, { canCreateAgents: !selected.canCreateAgents })} />
              </div>
            </Panel>
          </div>
        )}
      </section>
    </div>
  );
}

function SkillsTab({ skills, agents, onPromote }: {
  skills: SkillBinding[];
  agents: AgentProfile[];
  onPromote: (id: string) => void;
}) {
  const agentById = new Map(agents.map((agent) => [agent.id, agent.name]));
  return (
    <div className="space-y-3">
      <SectionHeader title="Skills" meta={`${skills.length} bindings`} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {skills.map((skill) => (
          <div key={skill.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-base font-semibold text-white/86">{skill.name}</h3>
              <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(skill.lifecycle) }}>{skill.lifecycle}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/55">{shortText(skill.description)}</p>
            <div className="mt-4 text-xs text-white/36">{skill.agentIds.map((id) => agentById.get(id) || id).join(", ") || "No agents"}</div>
            <div className="mt-4 flex items-center justify-between gap-2 text-xs text-white/35">
              <span>{skill.risk}</span>
              <span>{skill.requiredApprovalOwner}</span>
            </div>
            {skill.lifecycle !== "live" && (
              <button className="mt-4 rounded border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-100" onClick={() => onPromote(skill.id)}>
                Request Live
              </button>
            )}
          </div>
        ))}
        {skills.length === 0 && <EmptyPanel label="No skills" />}
      </div>
    </div>
  );
}

function CostsTab({ budgets, runs, agents, onNewBudget }: {
  budgets: BudgetPolicy[];
  runs: RunRecord[];
  agents: AgentProfile[];
  onNewBudget: () => void;
}) {
  const agentName = new Map(agents.map((agent) => [agent.id, agent.name]));
  const totalObserved = budgets.reduce((sum, budget) => sum + budget.observedUsd, 0);
  const runCost = runs.reduce((sum, run) => sum + (run.costUsd || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader title="Costs" meta={compactMoney(totalObserved + runCost)} />
        <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100" onClick={onNewBudget}>+ Budget</button>
      </div>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SignalTile label="Observed" value={compactMoney(totalObserved)} health="ok" source="budget ledger" />
        <SignalTile label="Run cost" value={compactMoney(runCost)} health="ok" source={`${runs.length} runs`} />
        <SignalTile label="Hard stops" value={`${budgets.filter((budget) => budget.mode === "hard").length}`} health={budgets.some((budget) => budget.status === "blocked") ? "blocked" : "ok"} source="budget policies" />
      </section>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {budgets.map((budget) => {
          const pct = budget.limitUsd > 0 ? Math.min(100, (budget.observedUsd / budget.limitUsd) * 100) : 0;
          const target = budget.scope === "agent" ? agentName.get(budget.targetId) || budget.targetId : budget.targetId;
          return (
            <div key={budget.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-base font-semibold text-white/85">{target}</h3>
                <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(budget.status) }}>{budget.status}</span>
              </div>
              <div className="mt-4 text-2xl font-semibold text-white">{compactMoney(budget.observedUsd)}</div>
              <div className="mt-1 text-xs text-white/35">limit {compactMoney(budget.limitUsd)} | {budget.mode}</div>
              <div className="mt-4 h-2 rounded-full bg-white/[0.06]">
                <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: statusColor(budget.status) }} />
              </div>
              <div className="mt-3 text-xs text-white/35">alert at {budget.alertAtPct}%</div>
            </div>
          );
        })}
        {budgets.length === 0 && <EmptyPanel label="No budgets" />}
      </div>
    </div>
  );
}

function ActivityTab({ activity, runs, sources }: {
  activity: ActivityEvent[];
  runs: RunRecord[];
  sources: BusinessMetric[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-3">
        <SectionHeader title="Activity" meta={`${activity.length} events`} />
        <div className="space-y-2">
          {[...activity].reverse().map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
          {activity.length === 0 && <EmptyPanel label="No activity" />}
        </div>
      </section>
      <section className="space-y-4">
        <Panel title="Runs" meta={`${runs.length}`}>
          <div className="space-y-2">
            {runs.slice(-8).reverse().map((run) => <RunMini key={run.id} run={run} />)}
            {runs.length === 0 && <EmptyPanel label="No runs" compact />}
          </div>
        </Panel>
        <Panel title="Sources" meta={`${sources.length}`}>
          <div className="space-y-2">
            {sources.map((source) => <SourceRow key={`${source.label}-${source.source}`} source={source} />)}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function SettingsTab({ company, sources, secrets, onNewSecret, onPatchCompany }: {
  company?: CompanyProfile;
  sources: BusinessMetric[];
  secrets: SecretRef[];
  onNewSecret: () => void;
  onPatchCompany: (patch: Partial<CompanyProfile>) => void;
}) {
  const [name, setName] = useState(company?.name || "");
  const [mission, setMission] = useState(company?.mission || "");

  useEffect(() => {
    setName(company?.name || "");
    setMission(company?.mission || "");
  }, [company?.name, company?.mission]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-4">
        <Panel title="Company" meta="profile">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[1.5px] text-white/32">Name</span>
              <input className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/40" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[1.5px] text-white/32">Mission</span>
              <textarea className="min-h-[96px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-cyan-200/40" value={mission} onChange={(event) => setMission(event.target.value)} />
            </label>
            <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100" onClick={() => onPatchCompany({ name, mission })}>
              Save
            </button>
          </div>
        </Panel>

        <Panel title="Approval Policy" meta={company?.approvalMode || "approval_gated"}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SignalTile label="Hiring" value={company?.requireApprovalForHires ? "Approval" : "Open"} health={company?.requireApprovalForHires ? "ok" : "watch"} source="new agents" />
            <SignalTile label="Authority" value="Leo/Amy/HELM" health="ok" source="risk-gated" />
          </div>
        </Panel>
      </section>

      <section className="space-y-4">
        <Panel title="Secrets" meta={`${secrets.length} sealed`}>
          <div className="space-y-2">
            {secrets.map((secret) => (
              <SimpleRecord key={secret.id} title={secret.key} meta={`${secret.provider} | ${secret.agentIds.length} grants`} tone="ok" />
            ))}
            {secrets.length === 0 && <EmptyPanel label="No secrets" compact />}
            <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100" onClick={onNewSecret}>
              + Secret
            </button>
          </div>
        </Panel>

        <Panel title="Source Health" meta={`${sources.length}`}>
          <div className="space-y-2">
            {sources.map((source) => <SourceRow key={`${source.label}-${source.source}`} source={source} />)}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function SignalTile({ label, value, health, source }: {
  label: string;
  value: string;
  health: ControlTowerHealth | string;
  source: string;
}) {
  const color = healthColor(health);
  return (
    <div className="min-h-[104px] rounded-lg border px-4 py-3" style={{ borderColor: `${color}33`, background: "#0b0d14" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[1.6px] text-white/35">{label}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-3 truncate text-xl font-semibold text-white">{value}</div>
      <div className="mt-2 truncate text-[11px] text-white/30">{source}</div>
    </div>
  );
}

function MetricFamily({ label, metrics }: { label: string; metrics: BusinessMetric[] }) {
  const worst = metrics.some((metric) => metric.health === "blocked") ? "blocked"
    : metrics.some((metric) => metric.health === "watch") ? "watch"
      : metrics.some((metric) => metric.health === "missing") ? "missing"
        : "ok";
  const color = healthColor(worst);
  return (
    <div className="rounded-lg border bg-white/[0.025] p-3" style={{ borderColor: `${color}2d` }}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="capitalize text-sm font-semibold text-white/85">{label}</h3>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="space-y-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-white/45">{metric.label}</span>
              <span className="truncate text-sm font-semibold text-white/85">{metric.value}</span>
            </div>
          </div>
        ))}
        {metrics.length === 0 && <div className="text-sm text-white/35">No feed</div>}
      </div>
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex min-h-8 items-end justify-between gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[2px] text-white/65">{title}</h2>
      {meta && <div className="text-[11px] text-white/28">{meta}</div>}
    </div>
  );
}

function EmptyPanel({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 ${compact ? "py-3" : "py-8"} text-sm text-white/35`}>
      {label}
    </div>
  );
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
      <SectionHeader title={title} meta={meta} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ApprovalRow({ approval, busy, onDecision }: {
  approval: ApprovalRequest;
  busy: string;
  onDecision: (id: string, decision: ApprovalActionDecision, decisionComment?: string) => void;
}) {
  const [decisionComment, setDecisionComment] = useState("");
  const color = approval.risk === "L4" ? "#ef4444" : approval.risk === "L3" ? "#f59e0b" : "#22c55e";
  const submitDecision = (decision: ApprovalActionDecision) => {
    onDecision(approval.id, decision, decisionComment);
    setDecisionComment("");
  };

  return (
    <div className="rounded-lg border bg-white/[0.03] p-4" style={{ borderColor: `${color}33` }}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <h3 className="truncate text-lg font-semibold text-white">{approval.title}</h3>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">{approval.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/35">
            <span>{approval.owner}</span>
            <span>{approval.risk}</span>
            <span>{approval.actionType}</span>
            <span>{formatDate(approval.requestedAt)}</span>
          </div>
          {approval.lastDecisionComment && (
            <p className="mt-3 rounded border border-white/[0.07] bg-black/20 px-3 py-2 text-xs leading-5 text-white/48">
              Last note: {approval.lastDecisionComment}
            </p>
          )}
        </div>
        <div className="w-full shrink-0 space-y-2 xl:w-[320px]">
          <div className="rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[1.4px] text-cyan-100/78">
              Approval Brief / Comment
            </div>
            <p className="mt-1 text-xs leading-5 text-white/45">
              ใส่เหตุผล เงื่อนไข หรือคำสั่งสั้นๆ ที่ต้องติดไปกับ approval นี้ใน audit/run ต่อไป
            </p>
            <textarea
              className="mt-2 h-24 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-white/72 outline-none placeholder:text-white/28 focus:border-cyan-200/45"
              placeholder="ตัวอย่าง: อนุมัติ แต่ให้ทำเป็น draft ก่อน ห้ามส่ง email/แก้ stock จนกว่า Amy ตรวจ"
              value={decisionComment}
              onChange={(event) => setDecisionComment(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button disabled={Boolean(busy)} className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100 disabled:opacity-40" onClick={() => submitDecision("approved")}>Approve</button>
            <button disabled={Boolean(busy)} className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100 disabled:opacity-40" onClick={() => submitDecision("changes_requested")}>Changes</button>
            <button disabled={Boolean(busy)} className="rounded-lg border border-red-300/25 bg-red-300/10 px-3 py-2 text-sm text-red-100 disabled:opacity-40" onClick={() => submitDecision("rejected")}>Reject</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacyApprovalCard({ approval }: { approval: ApprovalItem }) {
  const color = approval.risk === "L4" ? "#ef4444" : approval.risk === "L3" ? "#f59e0b" : "#22c55e";
  return (
    <div className="rounded-lg border bg-white/[0.03] p-4" style={{ borderColor: `${color}33` }}>
      <div className="text-[10px] uppercase tracking-[1.5px]" style={{ color }}>{approval.risk}</div>
      <h3 className="mt-2 text-base font-semibold text-white/85">{approval.title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/55">{shortText(approval.summary)}</p>
      <div className="mt-3 text-xs text-white/35">{approval.owner} | {approval.status}</div>
    </div>
  );
}

function IssueCard({ issue, active, onSelect, onStatus }: {
  issue: ControlTowerIssue;
  active: boolean;
  onSelect: () => void;
  onStatus: (status: IssueStatus) => void;
}) {
  return (
    <button
      className="w-full rounded-lg border px-3 py-3 text-left transition hover:border-white/20"
      style={{
        background: active ? "rgba(255,255,255,0.075)" : "rgba(255,255,255,0.03)",
        borderColor: active ? "rgba(125,211,252,0.35)" : "rgba(255,255,255,0.07)",
      }}
      onClick={onSelect}
    >
      <div className="text-[10px] uppercase tracking-[1.5px]" style={{ color: statusColor(issue.priority) }}>{issue.priority}</div>
      <div className="mt-1 text-sm font-semibold leading-5 text-white/85">{issue.title}</div>
      <div className="mt-2 text-xs text-white/35">{issue.assigneeName || issue.assigneeId || "Unassigned"}</div>
      <select
        className="mt-3 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/65 outline-none"
        value={issue.status}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onStatus(event.target.value as IssueStatus)}
      >
        {ISSUE_COLUMNS.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
      </select>
    </button>
  );
}

function IssueListRow({ issue, onSelect }: { issue: ControlTowerIssue; onSelect: () => void }) {
  return (
    <button className="flex w-full items-center gap-3 border-b border-white/[0.06] px-4 py-3 text-left last:border-b-0 hover:bg-white/[0.035]" onClick={onSelect}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusColor(issue.status) }} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/80">{issue.title}</span>
      <span className="hidden text-xs text-white/35 md:inline">{issue.assigneeName || issue.assigneeId || "Unassigned"}</span>
      <span className="text-xs uppercase tracking-[1px]" style={{ color: statusColor(issue.priority) }}>{issue.priority}</span>
    </button>
  );
}

function IssueDetail({ issue, projects, agents, onPatchIssue, onQueueRun }: {
  issue?: ControlTowerIssue;
  projects: ProjectItem[];
  agents: AgentProfile[];
  onPatchIssue: (id: string, patch: Partial<ControlTowerIssue>) => void;
  onQueueRun: (issue: ControlTowerIssue) => void;
}) {
  if (!issue) return <EmptyPanel label="Select an issue" />;
  return (
    <aside className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px]" style={{ color: statusColor(issue.status) }}>{issue.status}</div>
          <h3 className="mt-2 text-xl font-semibold text-white">{issue.title}</h3>
        </div>
        <button className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1.5 text-xs text-cyan-100" onClick={() => onQueueRun(issue)}>
          Queue Run
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-white/58">{issue.description || "No description"}</p>
      <div className="mt-5 space-y-3">
        <SelectField label="Status" value={issue.status} options={ISSUE_COLUMNS.map((column) => ({ value: column.key, label: column.label }))} onChange={(value) => onPatchIssue(issue.id, { status: value as IssueStatus })} />
        <SelectField label="Priority" value={issue.priority} options={ISSUE_PRIORITY.map((priority) => ({ value: priority, label: priority }))} onChange={(value) => onPatchIssue(issue.id, { priority: value as IssuePriority })} />
        <SelectField label="Assignee" value={issue.assigneeId || ""} options={[{ value: "", label: "Unassigned" }, ...agents.map((agent) => ({ value: agent.id, label: agent.name }))]} onChange={(value) => {
          const agent = agents.find((item) => item.id === value);
          onPatchIssue(issue.id, { assigneeId: value || undefined, assigneeName: agent?.name });
        }} />
        <SelectField label="Project" value={issue.projectId || ""} options={[{ value: "", label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.title }))]} onChange={(value) => onPatchIssue(issue.id, { projectId: value || undefined })} />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3">
        <DetailCell label="Labels" value={joinLabels(issue.labels)} />
        <DetailCell label="Blocked By" value={issue.blockedBy || "Clear"} />
        <DetailCell label="Last Artifact" value={issue.lastArtifact || "No artifact"} />
        <DetailCell label="Updated" value={formatDate(issue.updatedAt)} />
      </div>
    </aside>
  );
}

function OrgBranch({ profile, children, agents, onOpenAgent }: {
  profile: AgentProfile;
  children: AgentProfile[];
  agents: AgentState[];
  onOpenAgent: (id: string) => void;
}) {
  const live = matchLiveAgent(profile, agents);
  return (
    <div className="flex flex-col items-center gap-4">
      <button className="min-h-[126px] w-[260px] rounded-lg border border-white/[0.08] bg-[#11131d] p-4 text-left hover:border-cyan-200/30" onClick={() => onOpenAgent(profile.id)}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: live ? runtimeStatusColor(live.status) : statusColor(profile.lifecycle) }} />
          <span className="font-semibold text-white">{profile.name}</span>
        </div>
        <div className="mt-2 text-xs text-white/45">{profile.title}</div>
        <div className="mt-3 text-[11px] uppercase tracking-[1px]" style={{ color: statusColor(profile.lifecycle) }}>{profile.lifecycle}</div>
      </button>
      {children.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {children.map((child) => (
            <button key={child.id} className="w-[220px] rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-left hover:border-white/20" onClick={() => onOpenAgent(child.id)}>
              <div className="truncate text-sm font-semibold text-white/82">{child.name}</div>
              <div className="mt-1 truncate text-xs text-white/38">{child.title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HumanNode({ name, title, tone }: { name: string; title: string; tone: string }) {
  return (
    <div className="w-[260px] rounded-lg border bg-white/[0.035] p-4" style={{ borderColor: `${tone}33` }}>
      <div className="font-semibold text-white">{name}</div>
      <div className="mt-2 text-xs text-white/45">{title}</div>
    </div>
  );
}

function RunCard({ run, busy, onResumeRun, onRequestReview }: {
  run: RunRecord;
  busy?: boolean;
  onResumeRun?: (id: string) => void;
  onRequestReview?: (id: string) => void;
}) {
  const syncTone = run.oracleSyncState === "blocked" || run.oracleSyncState === "stale" ? "#ef4444" : run.oracleSyncState === "handoff_ready" || run.oracleSyncState === "review_ready" ? "#f59e0b" : run.oracleSyncState ? "#22c55e" : "#64748b";
  const supervisorOpen = run.supervisorState && !["ok", "done"].includes(run.supervisorState);
  const supervisorTone = supervisorOpen ? healthColor(run.supervisorSeverity || "watch") : "#64748b";
  const canResume = run.supervisorState === "needs_resume" || run.supervisorState === "needs_operator_choice";
  const canRequestReview = run.supervisorState === "needs_review";
  return (
    <div className="min-h-[150px] rounded-lg border bg-cyan-300/[0.035] p-4" style={{ borderColor: supervisorOpen ? `${supervisorTone}45` : "rgb(103 232 249 / 0.2)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-white/85">{run.agentName}</span>
        <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(run.status) }}>{run.status}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/55">{shortText(run.summary)}</p>
      {supervisorOpen && (
        <div className="mt-3 rounded border bg-black/25 px-3 py-2" style={{ borderColor: `${supervisorTone}35` }}>
          <div className="text-[10px] uppercase tracking-[1px]" style={{ color: supervisorTone }}>{run.supervisorState}</div>
          {run.supervisorReason && <div className="mt-1 text-xs leading-5 text-white/55">{run.supervisorReason}</div>}
          {run.supervisorNextAction && <div className="mt-1 text-xs leading-5 text-cyan-100/55">Next: {run.supervisorNextAction}</div>}
          {canResume && onResumeRun && (
            <button
              className="mt-2 rounded border border-amber-200/30 bg-amber-200/[0.08] px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-100/55 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={Boolean(busy)}
              onClick={() => onResumeRun(run.id)}
            >
              {busy ? "Creating..." : "Create resume"}
            </button>
          )}
          {canRequestReview && onRequestReview && (
            <button
              className="mt-2 rounded border border-emerald-200/30 bg-emerald-200/[0.08] px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-100/55 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={Boolean(busy)}
              onClick={() => onRequestReview(run.id)}
            >
              {busy ? "Queueing..." : "Request review"}
            </button>
          )}
        </div>
      )}
      {(run.oracleSyncState || run.oracleSyncReason) && (
        <div className="mt-3 rounded border border-white/[0.06] bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[1px]" style={{ color: syncTone }}>{run.oracleSyncState || "oracle sync"}</div>
          {run.oracleSyncReason && <div className="mt-1 text-xs leading-5 text-white/48">{run.oracleSyncReason}</div>}
          {(run.lastOracleArtifactPath || run.artifactPath || run.agentInboxArtifactPath) && (
            <div className="mt-1 truncate text-[11px] text-cyan-200/50">{run.lastOracleArtifactPath || run.artifactPath || run.agentInboxArtifactPath}</div>
          )}
        </div>
      )}
      <div className="mt-3 text-xs text-white/35">{run.trigger} | {run.issueId || "no issue"}</div>
    </div>
  );
}

function RunMini({ run }: { run: RunRecord }) {
  return (
    <div className="rounded border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-white/78">{run.agentName}</span>
        <span className="text-[10px] uppercase tracking-[1px]" style={{ color: statusColor(run.status) }}>{run.status}</span>
      </div>
      <div className="mt-1 text-xs text-white/35">{run.trigger} | {compactMoney(run.costUsd)}</div>
      {run.oracleSyncState && <div className="mt-1 truncate text-[11px] text-cyan-200/45">Oracle: {run.oracleSyncState}</div>}
    </div>
  );
}

function IssueMini({ issue }: { issue: ControlTowerIssue }) {
  return (
    <div className="rounded border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="truncate text-sm text-white/78">{issue.title}</div>
      <div className="mt-1 text-xs text-white/35">{issue.status} | {issue.priority}</div>
    </div>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const color = healthColor(event.severity);
  return (
    <div className="rounded-lg border bg-white/[0.03] px-4 py-3" style={{ borderColor: `${color}2f` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white/85">{event.summary}</div>
          <div className="mt-1 text-xs text-white/35">{event.actor} | {event.type} | {event.targetType}:{event.targetId}</div>
        </div>
        <div className="shrink-0 text-xs text-white/32">{formatDate(event.createdAt)}</div>
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: BusinessMetric }) {
  const color = healthColor(source.health);
  return (
    <div className="rounded border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-white/75">{source.label}</span>
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="mt-1 truncate text-xs text-white/35">{source.value} | {source.source}</div>
    </div>
  );
}

function SimpleRecord({ title, meta, tone }: { title: string; meta: string; tone: ControlTowerHealth | string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-black/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: healthColor(tone) }} />
        <span className="truncate text-sm text-white/78">{title}</span>
      </div>
      <div className="mt-1 truncate text-xs text-white/35">{meta}</div>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[1.4px] text-white/30">{label}</div>
      <div className="mt-1 break-words text-sm text-white/70">{value ?? "Not set"}</div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[1.4px] text-white/30">{label}</span>
      <select className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75 outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ToggleButton({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <button className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3 text-left" onClick={onToggle}>
      <div className="text-[10px] uppercase tracking-[1.4px] text-white/30">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: value ? "#22c55e" : "#64748b" }} />
        <span className="text-sm text-white/70">{value ? "Enabled" : "Disabled"}</span>
      </div>
    </button>
  );
}

function NumberField({ label, value, onSubmit }: { label: string; value: number; onSubmit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="block rounded-lg border border-white/[0.07] bg-black/20 px-3 py-3">
      <span className="text-[10px] uppercase tracking-[1.4px] text-white/30">{label}</span>
      <div className="mt-2 flex gap-2">
        <input className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="button" className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2.5 text-xs text-cyan-100" onClick={() => onSubmit(Number(draft) || value)}>Set</button>
      </div>
    </label>
  );
}

function IssueModal({ agents, projects, onClose, onCreate }: {
  agents: AgentProfile[];
  projects: ProjectItem[];
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(agents[0]?.id || "");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [priority, setPriority] = useState<IssuePriority>("medium");

  return (
    <Modal title="New Issue" onClose={onClose} actionLabel="Create Issue" onAction={() => {
      const assignee = agents.find((agent) => agent.id === assigneeId);
      onCreate({ title, description, assigneeId, assigneeName: assignee?.name, projectId, priority, status: "todo", labels: [], createdBy: "Leo" });
    }}>
      <ModalInput label="Title" value={title} onChange={setTitle} autoFocus />
      <ModalTextarea label="Description" value={description} onChange={setDescription} />
      <ModalSelect label="Assignee" value={assigneeId} options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} onChange={setAssigneeId} />
      <ModalSelect label="Project" value={projectId} options={[{ value: "", label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.title }))]} onChange={setProjectId} />
      <ModalSelect label="Priority" value={priority} options={ISSUE_PRIORITY.map((item) => ({ value: item, label: item }))} onChange={(value) => setPriority(value as IssuePriority)} />
    </Modal>
  );
}

function AgentModal({ agents, onClose, onCreate }: {
  agents: AgentProfile[];
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [reportsTo, setReportsTo] = useState(agents[0]?.id || "david");
  const [model, setModel] = useState("gpt-5.3-codex");

  return (
    <Modal title="Hire Agent" onClose={onClose} actionLabel="Request Hire" onAction={() => onCreate({
      name,
      title: title || name,
      role,
      capabilities: role,
      reportsTo,
      model,
      requestedBy: "Leo",
    })}>
      <ModalInput label="Name" value={name} onChange={setName} autoFocus />
      <ModalInput label="Title" value={title} onChange={setTitle} />
      <ModalTextarea label="Role" value={role} onChange={setRole} />
      <ModalSelect label="Reports To" value={reportsTo} options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} onChange={setReportsTo} />
      <ModalInput label="Model" value={model} onChange={setModel} />
    </Modal>
  );
}

function RoutineModal({ agents, projects, onClose, onCreate }: {
  agents: AgentProfile[];
  projects: ProjectItem[];
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState("daily 09:00 Asia/Bangkok");
  const [assigneeId, setAssigneeId] = useState(agents[0]?.id || "");
  const [projectId, setProjectId] = useState(projects[0]?.id || "");

  return (
    <Modal title="New Routine" onClose={onClose} actionLabel="Request Routine" onAction={() => onCreate({
      title,
      description,
      schedule,
      assigneeId,
      projectId,
      requestedBy: "Leo",
      createsIssueTemplate: { title, description, priority: "medium" },
    })}>
      <ModalInput label="Title" value={title} onChange={setTitle} autoFocus />
      <ModalTextarea label="Description" value={description} onChange={setDescription} />
      <ModalInput label="Schedule" value={schedule} onChange={setSchedule} />
      <ModalSelect label="Assignee" value={assigneeId} options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} onChange={setAssigneeId} />
      <ModalSelect label="Project" value={projectId} options={[{ value: "", label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.title }))]} onChange={setProjectId} />
    </Modal>
  );
}

function SecretModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState("external");
  const [value, setValue] = useState("");

  return (
    <Modal title="Seal Secret" onClose={onClose} actionLabel="Seal" onAction={() => onCreate({ key, provider, value, scope: "company" })}>
      <ModalInput label="Key" value={key} onChange={setKey} autoFocus />
      <ModalInput label="Provider" value={provider} onChange={setProvider} />
      <ModalInput label="Value" value={value} onChange={setValue} password />
    </Modal>
  );
}

function BudgetModal({ agents, projects, onClose, onCreate }: {
  agents: AgentProfile[];
  projects: ProjectItem[];
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const targets = [
    { value: "company:kaiju-ai-office", label: "Company" },
    ...agents.map((agent) => ({ value: `agent:${agent.id}`, label: `Agent: ${agent.name}` })),
    ...projects.map((project) => ({ value: `project:${project.id}`, label: `Project: ${project.title}` })),
  ];
  const [target, setTarget] = useState(targets[0]?.value || "company:kaiju-ai-office");
  const [limitUsd, setLimitUsd] = useState("0");
  const [mode, setMode] = useState("soft");

  return (
    <Modal title="Budget Policy" onClose={onClose} actionLabel="Request Budget" onAction={() => {
      const [scope, targetId] = target.split(":");
      onCreate({ scope, targetId, limitUsd: Number(limitUsd) || 0, mode, requestedBy: "Leo" });
    }}>
      <ModalSelect label="Target" value={target} options={targets} onChange={setTarget} />
      <ModalInput label="Limit USD" value={limitUsd} onChange={setLimitUsd} />
      <ModalSelect label="Mode" value={mode} options={[{ value: "soft", label: "soft" }, { value: "hard", label: "hard" }]} onChange={setMode} />
    </Modal>
  );
}

function Modal({ title, children, actionLabel, onAction, onClose }: {
  title: string;
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4">
      <div className="w-full max-w-xl rounded-lg border border-white/[0.09] bg-[#0b0d14] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button className="rounded border border-white/10 px-2 py-1 text-sm text-white/60" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-3 px-5 py-5">{children}</div>
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
          <button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/65" onClick={onClose}>Cancel</button>
          <button className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-sm font-medium text-cyan-100" onClick={onAction}>{actionLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ModalInput({ label, value, onChange, autoFocus = false, password = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  password?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[1.4px] text-white/32">{label}</span>
      <input autoFocus={autoFocus} type={password ? "password" : "text"} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/40" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ModalTextarea({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[1.4px] text-white/32">{label}</span>
      <textarea className="min-h-[110px] w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-cyan-200/40" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ModalSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[1.4px] text-white/32">{label}</span>
      <select className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-200/40" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

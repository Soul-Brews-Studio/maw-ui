import type { DecisionQueueSnapshot, OracleBridgeSnapshot, ProjectOperatingRoomRecord, TokenLedger, WorkMapSnapshot } from "./companyOsTypes";
import type { CommerceOfficeState } from "./commerceOfficeTypes";

export type ControlTowerHealth = "ok" | "watch" | "blocked" | "missing";

export type ControlTowerOwner = "Leo" | "Amy" | "HELM" | "David" | "KaijuPM" | "WATCHDOG";

export type ControlTowerRisk = "L1" | "L2" | "L3" | "L4";

export type AgentLifecycle = "draft" | "pending_approval" | "active" | "paused" | "retired";
export type IssueStatus = "backlog" | "todo" | "in_progress" | "review" | "blocked" | "done" | "cancelled";
export type IssuePriority = "critical" | "high" | "medium" | "low";
export type ApprovalDecision = "pending" | "approved" | "rejected" | "changes_requested";
export type RunStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "stale";
export type OracleRunSyncState = "no_signal" | "acknowledged" | "handoff_ready" | "review_ready" | "completed" | "blocked" | "stale";
export type SupervisorRunState = "ok" | "needs_resume" | "needs_operator_choice" | "needs_review" | "blocked" | "done";
export type RoutineStatus = "draft" | "active" | "paused";
export type SkillLifecycle = "draft" | "review" | "approved" | "live" | "observed" | "deprecated";
export type BudgetScope = "company" | "agent" | "project";
export type BudgetMode = "soft" | "hard";
export type ActivitySeverity = "info" | "watch" | "blocked" | "ok";

export interface BusinessMetric {
  label: string;
  value: string;
  source: string;
  health: ControlTowerHealth;
  updatedAt?: string;
  owner?: string;
  artifactPath?: string;
}

export interface ApprovalItem {
  id: string;
  owner: ControlTowerOwner;
  risk: ControlTowerRisk;
  title: string;
  status: "pending" | "blocked" | "ready";
  summary?: string;
  artifactPath?: string;
  createdAt?: string;
}

export interface ApprovalDecisionComment {
  id?: string;
  author?: string;
  body: string;
  decision?: ApprovalDecision | string;
  createdAt?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  owner: string;
  status: "active" | "parked" | "blocked" | "review" | "done";
  health: ControlTowerHealth;
  agents?: string[];
  summary?: string;
  nextAction?: string;
  artifactPath?: string;
  dueAt?: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  agent: string;
  role: string;
  status: "todo" | "doing" | "blocked" | "review" | "done" | "parked";
  health: ControlTowerHealth;
  summary?: string;
  blockedBy?: string;
  nextAction?: string;
  lastArtifact?: string;
  artifactPath?: string;
  dueAt?: string;
  updatedAt?: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  mission: string;
  description?: string;
  brandColor?: string;
  requireApprovalForHires: boolean;
  approvalMode: "approval_gated";
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  title: string;
  role: string;
  reportsTo?: string;
  owner: string;
  lifecycle: AgentLifecycle;
  adapter: string;
  model: string;
  thinkingEffort?: string;
  heartbeatSec: number;
  canCreateAgents: boolean;
  canAssignTasks: boolean;
  canUseSearch: boolean;
  capabilities: string;
  skills: string[];
  toolSecretIds: string[];
  currentIssueId?: string;
  budgetUsd?: number;
  observedSpendUsd?: number;
  lastRunId?: string;
  nextHeartbeatAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ControlTowerIssue {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId?: string;
  assigneeName?: string;
  projectId?: string;
  goalId?: string;
  labels: string[];
  blockedBy?: string;
  parentIssueId?: string;
  subIssueIds: string[];
  approvalIds: string[];
  runIds: string[];
  attachments: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  lastArtifact?: string;
  lastArtifactPath?: string;
}

export interface ApprovalRequest {
  id: string;
  title: string;
  summary: string;
  owner: ControlTowerOwner;
  risk: ControlTowerRisk;
  decision: ApprovalDecision;
  actionType: "hire_agent" | "grant_tool" | "runtime_change" | "create_routine" | "external_action" | "promote_skill" | "budget_change" | "issue_gate" | "oracle_intent" | "project_decision" | "stock_movement" | "production_batch";
  targetType: "agent" | "issue" | "routine" | "skill" | "secret" | "budget" | "company";
  targetId: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  artifactPath?: string;
  lastDecisionComment?: string;
  comments?: ApprovalDecisionComment[];
}

export interface RunRecord {
  id: string;
  issueId?: string;
  agentId: string;
  agentName: string;
  trigger: "manual" | "heartbeat" | "routine" | "approval" | "decision-approved" | "supervisor_resume" | "supervisor_review";
  status: RunStatus;
  summary: string;
  stdoutPreview?: string;
  startedAt?: string;
  finishedAt?: string;
  tokenCount?: number;
  costUsd?: number;
  lockKey?: string;
  sourceRunId?: string;
  resumeSourceRunId?: string;
  resumedByRunId?: string;
  reviewSourceRunId?: string;
  reviewRequestedRunId?: string;
  reviewRequestedAt?: string;
  artifactPath?: string;
  agentInboxArtifactPath?: string;
  lastOracleArtifactPath?: string;
  oracleSyncState?: OracleRunSyncState;
  oracleSyncReason?: string;
  oracleSyncCheckedAt?: string;
  oracleSyncFingerprint?: string;
  supervisorState?: SupervisorRunState;
  supervisorReason?: string;
  supervisorNextAction?: string;
  supervisorSeverity?: ActivitySeverity;
  supervisorArtifactPath?: string;
  updatedAt?: string;
}

export interface OracleRunnerSyncSignal {
  runId: string;
  issueId?: string;
  agentId: string;
  state: OracleRunSyncState;
  status: RunStatus;
  issueStatus?: IssueStatus;
  artifactPath?: string;
  reason: string;
  supervisorState?: SupervisorRunState;
  supervisorReason?: string;
  supervisorNextAction?: string;
  supervisorSeverity?: ActivitySeverity;
}

export interface FlowSupervisorSnapshot {
  generatedAt?: string | null;
  totalRuns?: number;
  activeRuns?: number;
  staleRuns?: Array<Record<string, unknown>>;
  stalePath?: string | null;
  lifecyclePath?: string | null;
  recentEvents?: Array<Record<string, unknown>>;
}

export interface OracleRunnerSyncSnapshot {
  checked: number;
  changed: number;
  stale: number;
  needsSupervisor?: number;
  needsResume?: number;
  needsOperatorChoice?: number;
  checkedAt: string;
  signals: OracleRunnerSyncSignal[];
  flowSupervisor?: FlowSupervisorSnapshot;
}

export interface RoutineRecord {
  id: string;
  title: string;
  description: string;
  status: RoutineStatus;
  schedule: string;
  assigneeId?: string;
  projectId?: string;
  createsIssueTemplate: {
    title: string;
    description: string;
    priority: IssuePriority;
  };
  approvalRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillBinding {
  id: string;
  name: string;
  description: string;
  lifecycle: SkillLifecycle;
  risk: ControlTowerRisk;
  owner: string;
  agentIds: string[];
  requiredApprovalOwner: ControlTowerOwner;
  artifactPath?: string;
}

export interface SecretRef {
  id: string;
  key: string;
  label: string;
  provider: string;
  scope: "company" | "agent";
  agentIds: string[];
  sealed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetPolicy {
  id: string;
  scope: BudgetScope;
  targetId: string;
  limitUsd: number;
  observedUsd: number;
  alertAtPct: number;
  mode: BudgetMode;
  status: "ok" | "watch" | "blocked";
  updatedAt: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  actor: string;
  targetType: string;
  targetId: string;
  summary: string;
  severity: ActivitySeverity;
  correlationId?: string;
  createdAt: string;
  artifactPath?: string;
}

export interface ControlTowerPayload {
  version?: string;
  updatedAt: string;
  correlationId?: string;
  commerce?: BusinessMetric[];
  operations?: BusinessMetric[];
  finance?: BusinessMetric[];
  content?: BusinessMetric[];
  projects?: ProjectItem[];
  tasks?: ProjectTask[];
  approvals?: ApprovalItem[];
  sources?: BusinessMetric[];
  company?: CompanyProfile;
  agentProfiles?: AgentProfile[];
  issues?: ControlTowerIssue[];
  approvalRequests?: ApprovalRequest[];
  runs?: RunRecord[];
  routines?: RoutineRecord[];
  skillBindings?: SkillBinding[];
  secrets?: SecretRef[];
  budgets?: BudgetPolicy[];
  activity?: ActivityEvent[];
  missionRooms?: ProjectOperatingRoomRecord[];
  commerceOffice?: CommerceOfficeState;
  decisionQueue?: DecisionQueueSnapshot;
  tokenLedgers?: TokenLedger[];
  oracleBridge?: OracleBridgeSnapshot;
  workMap?: WorkMapSnapshot;
  runnerSync?: OracleRunnerSyncSnapshot;
  flowSupervisor?: FlowSupervisorSnapshot;
}

export const EMPTY_CONTROL_TOWER_PAYLOAD: ControlTowerPayload = {
  version: "0",
  updatedAt: "",
  commerce: [
    { label: "Orders Today", value: "No feed", source: "Google Sheets / marketplace APIs", health: "missing" },
    { label: "Revenue Today", value: "No feed", source: "Google Sheets / marketplace APIs", health: "missing" },
    { label: "Top SKU", value: "No feed", source: "PULSE", health: "missing" },
  ],
  operations: [
    { label: "Packing Queue", value: "No feed", source: "OPS sheet", health: "missing" },
    { label: "Stock Risks", value: "No feed", source: "stock sheet", health: "missing" },
    { label: "Worker Instructions", value: "No feed", source: "Amy / OPS bot", health: "missing" },
  ],
  finance: [
    { label: "Estimated Margin", value: "No feed", source: "MONEY / SKU costs", health: "missing" },
    { label: "Missing Costs", value: "No feed", source: "sku_costs", health: "missing" },
    { label: "Docs Pending", value: "No feed", source: "Drive/accounting", health: "missing" },
  ],
  content: [
    { label: "Creator Pipeline", value: "No feed", source: "SCOUT", health: "missing" },
    { label: "Content Ready", value: "No feed", source: "PRINT", health: "missing" },
    { label: "Campaign Approvals", value: "No feed", source: "approval queue", health: "missing" },
  ],
  projects: [],
  tasks: [],
  approvals: [],
  company: {
    id: "kaiju-ai-office",
    name: "Kaiju AI Office",
    mission: "Operate Kaiju with approval-gated AI departments, real source-of-truth data, and visible accountability.",
    requireApprovalForHires: true,
    approvalMode: "approval_gated",
  },
  agentProfiles: [],
  issues: [],
  approvalRequests: [],
  runs: [],
  routines: [],
  skillBindings: [],
  secrets: [],
  budgets: [],
  activity: [],
  missionRooms: [],
  decisionQueue: {
    status: "active",
    summary: "Default decision interface for Leo/Amy/HELM proposals.",
    openCount: 0,
    criticalCount: 0,
    briefs: [],
  },
  tokenLedgers: [],
  oracleBridge: {
    mode: "read_link_intent",
    root: "",
    allowlist: [],
    writable: [],
    intentCount: 0,
  },
  workMap: {
    schemaVersion: "kaiju-work-map-v0",
    hierarchy: [],
    peopleQueues: [],
    workAreas: [],
    projectFlow: [],
    agentUseCases24x7: [],
    oracleHandoff: {
      status: "drafted",
      owner: "David",
      targetInbox: "ψ/memory/helm/inbox",
      nextAction: "Awaiting Oracle Agent Team intake.",
      sourcePaths: [],
    },
  },
  sources: [
    { label: "maw-js Agent Feed", value: "Live when connected", source: "/api/sessions + /ws", health: "ok" },
    { label: "Business Sheet", value: "Not connected", source: "Google Sheets", health: "missing" },
    { label: "Accounting Docs", value: "Not connected", source: "Drive", health: "missing" },
    { label: "Marketplaces", value: "Not connected", source: "Shopee/Lazada/TikTok", health: "missing" },
  ],
};

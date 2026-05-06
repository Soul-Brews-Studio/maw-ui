import type { ControlTowerRisk, IssueStatus, RunStatus } from "./controlTowerTypes";

export type UserRole = "leo" | "amy" | "helm" | "ai_agent" | "staff_operator" | "future_employee";
export type RoomStatus = "draft" | "active" | "paused" | "done" | "archived";
export type DecisionStatus = "proposed" | "pending_approval" | "accepted" | "rejected" | "superseded";
export type TokenBudgetMode = "observe" | "soft" | "hard";
export type CompactionStatus = "ready" | "needed" | "running" | "blocked";
export type WorkQueueRole = "owner" | "operator" | "approver" | "ai_agent" | "observer";
export type WorkAreaTone = "commerce" | "content" | "product" | "finance" | "ops" | "governance";
export type DecisionBriefStatus = "pending" | "approved" | "rejected" | "request_changes" | "deferred" | "superseded";
export type DecisionRiskLevel = "low" | "medium" | "high" | "critical";
export type DecisionUrgency = "today" | "this_week" | "before_next_phase" | "watch";

export interface MissionMessage {
  id: string;
  author: string;
  role: UserRole | string;
  summary: string;
  sourceModel?: string;
  createdAt: string;
}

export interface DecisionRecord {
  id: string;
  owner: string;
  risk: ControlTowerRisk;
  title: string;
  status: DecisionStatus | string;
  rationale: string;
  approvalId?: string | null;
  createdAt: string;
}

export interface ContextCapsule {
  id: string;
  mission: string;
  currentState: string[];
  constraints: string[];
  decisions?: string[];
  openQuestions: string[];
  sourceLinks: string[];
  retrievalLimit: number;
  updatedAt: string;
}

export interface ProjectOperatingRoomRecord {
  id: string;
  projectId: string;
  title: string;
  mission: string;
  status: RoomStatus | string;
  owners: string[];
  participants: string[];
  contextCapsule: ContextCapsule;
  messages: MissionMessage[];
  decisions: DecisionRecord[];
  linkedIssueIds: string[];
  linkedRunIds: string[];
  linkedApprovalIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TokenLedger {
  id: string;
  projectId: string;
  agentId: string;
  issueId?: string;
  runId?: string;
  budgetTokens: number;
  usedTokens: number;
  budgetUsd: number;
  usedUsd: number;
  mode: TokenBudgetMode;
  retrievalLimit: number;
  compactionStatus: CompactionStatus | string;
  lastSummary?: string;
  updatedAt?: string;
}

export interface OracleBridgeSnapshot {
  mode: "read_link_intent" | string;
  root: string;
  allowlist: string[];
  writable: string[];
  intentCount: number;
  updatedAt?: string;
}

export interface WorkPersonQueue {
  id: string;
  name: string;
  role: WorkQueueRole | string;
  surface: "control_tower" | "project_room" | "commerce_office" | "oracle_team" | string;
  focus: string;
  openCount: number;
  blockedCount: number;
  nextAction: string;
}

export interface WorkAreaSnapshot {
  id: string;
  title: string;
  owner: string;
  tone: WorkAreaTone | string;
  projectCount: number;
  activeTaskCount: number;
  blockedCount: number;
  flow: string[];
  sampleProjects: string[];
}

export interface ProjectFlowStep {
  id: string;
  label: string;
  description: string;
  status: "ready" | "active" | "watch" | "blocked" | string;
  owner: string;
}

export interface AgentUseCase24x7 {
  id: string;
  title: string;
  agent: string;
  cadence: string;
  approvalGate: string;
  output: string;
  status: "draft" | "ready" | "live" | "blocked" | string;
}

export interface OracleHandoffSnapshot {
  status: "drafted" | "ready_for_agents" | "in_progress" | "blocked" | string;
  owner: string;
  targetInbox: string;
  nextAction: string;
  sourcePaths: string[];
}

export interface DecisionBriefOption {
  id: string;
  label: string;
  meaning: string;
  pros?: string[];
  cons?: string[];
  example?: string;
  recommended?: boolean;
}

export interface DecisionBrief {
  id: string;
  title: string;
  status: DecisionBriefStatus | string;
  decisionOwner: string;
  source?: string;
  sourceRef?: string;
  projectId?: string;
  workAreaId?: string;
  riskLevel: DecisionRiskLevel | string;
  urgency: DecisionUrgency | string;
  plainLanguageQuestion: string;
  contextShort?: string;
  whyThisMatters: string;
  options?: DecisionBriefOption[];
  recommendedOption?: string;
  impactIfApprove?: string;
  impactIfReject?: string;
  impactIfWait?: string;
  requiredApprovers?: string[];
  nextActionAfterDecision: string;
  links?: string[];
}

export interface DecisionQueueSnapshot {
  status: "draft" | "active" | "blocked" | string;
  summary: string;
  openCount: number;
  criticalCount: number;
  briefs: DecisionBrief[];
}

export interface WorkMapSnapshot {
  schemaVersion: string;
  updatedAt?: string;
  hierarchy: string[];
  decisionQueue?: DecisionQueueSnapshot;
  peopleQueues: WorkPersonQueue[];
  workAreas: WorkAreaSnapshot[];
  projectFlow: ProjectFlowStep[];
  agentUseCases24x7: AgentUseCase24x7[];
  oracleHandoff: OracleHandoffSnapshot;
}

export interface ProjectRoomIssueSummary {
  id: string;
  title: string;
  status: IssueStatus;
  assigneeId?: string;
}

export interface ProjectRoomRunSummary {
  id: string;
  agentId: string;
  issueId?: string;
  status: RunStatus;
  summary: string;
}

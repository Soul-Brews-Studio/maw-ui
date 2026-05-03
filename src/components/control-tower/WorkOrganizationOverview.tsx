import { useState } from "react";
import type {
  AgentUseCase24x7,
  DecisionBrief,
  DecisionQueueSnapshot,
  ProjectFlowStep,
  WorkAreaSnapshot,
  WorkMapSnapshot,
  WorkPersonQueue,
} from "../../lib/companyOsTypes";

const FALLBACK_WORK_MAP: WorkMapSnapshot = {
  schemaVersion: "kaiju-work-map-v0",
  hierarchy: ["Company", "Work Area", "Project", "Stage", "Task", "Subtask", "Run / Approval / Artifact"],
  decisionQueue: {
    status: "active",
    summary: "CEO-level decisions are converted into readable briefs before Leo/Amy/HELM approve.",
    openCount: 2,
    criticalCount: 1,
    briefs: [
      {
        id: "decision-ar1-readonly-pre-dvl",
        title: "เริ่ม Oracle read-only cleanup pilot ก่อน DVL",
        status: "pending",
        decisionOwner: "Leo",
        sourceRef: "AR1",
        riskLevel: "medium",
        urgency: "before_next_phase",
        plainLanguageQuestion: "ให้ Oracle Team เริ่มจัดบ้านแบบอ่านอย่างเดียว เพื่อทำ project capsule, agent inventory, และ schema draft ก่อนไหม",
        whyThisMatters: "ช่วยให้ระบบเห็นภาพงานและ context ชัดขึ้นเร็ว โดยยังไม่แตะ core/production",
        recommendedOption: "approve_read_only",
        nextActionAfterDecision: "สร้าง read-only issue/run ให้ Oracle Housekeeper พร้อม token cap",
      },
      {
        id: "decision-ar6-heartbeat-supervisor-token-cap",
        title: "ล็อก 24/7 heartbeat จนกว่าจะมี supervisor + token cap",
        status: "pending",
        decisionOwner: "HELM / Leo",
        sourceRef: "AR6",
        riskLevel: "critical",
        urgency: "today",
        plainLanguageQuestion: "ควรกำหนดว่า agent 24/7 ห้ามเริ่มทำงานจริงจนกว่าจะมี supervisor และ token cap ใช่ไหม",
        whyThisMatters: "กัน token บวม, stale run, และงานข้าม project ก่อนระบบคุมพร้อม",
        recommendedOption: "require_supervisor_and_cap",
        nextActionAfterDecision: "บันทึก policy และแสดง blocked reason ใน agent panel",
      },
    ],
  },
  peopleQueues: [
    {
      id: "person-leo",
      name: "Leo",
      role: "owner",
      surface: "control_tower",
      focus: "ทิศทาง, approval, budget, production change",
      openCount: 0,
      blockedCount: 0,
      nextAction: "Review Overall Dashboard",
    },
    {
      id: "person-amy",
      name: "Amy",
      role: "owner",
      surface: "project_room",
      focus: "สินค้า, costing, เอกสาร, finance reality",
      openCount: 0,
      blockedCount: 0,
      nextAction: "Confirm project stages",
    },
    {
      id: "person-staff",
      name: "Staff Operator",
      role: "operator",
      surface: "commerce_office",
      focus: "แพ็กของ, ผสมสูตร, นับ stock",
      openCount: 0,
      blockedCount: 0,
      nextAction: "Use Commerce Office only",
    },
  ],
  workAreas: [
    {
      id: "area-sku-product",
      title: "SKU / Product Development",
      owner: "Amy",
      tone: "product",
      projectCount: 12,
      activeTaskCount: 24,
      blockedCount: 2,
      flow: ["Concept", "Development", "Testing", "Costing", "Design", "Approval", "Production", "QC"],
      sampleProjects: ["SKU KAIJU", "บรรจุภัณฑ์", "สูตร/ขนาด/ฉลาก"],
    },
    {
      id: "area-tiktok-daily-ops",
      title: "TikTok Daily Ops",
      owner: "Leo",
      tone: "commerce",
      projectCount: 1,
      activeTaskCount: 18,
      blockedCount: 0,
      flow: ["Todo", "Doing", "Waiting review", "Completed"],
      sampleProjects: ["Daily operation", "สรุปรายงานก่อน 17.00", "ยอดขาย/โฆษณา"],
    },
    {
      id: "area-commerce-office",
      title: "Commerce Office Operations",
      owner: "Amy",
      tone: "ops",
      projectCount: 4,
      activeTaskCount: 16,
      blockedCount: 1,
      flow: ["Receive", "Pick", "Pack", "Formula mix", "Stock count", "QC", "Ship", "Record"],
      sampleProjects: ["Packing", "Stock", "Production log", "Returns"],
    },
    {
      id: "area-docs-admin",
      title: "Documents / Finance / Admin",
      owner: "Leo / Amy",
      tone: "finance",
      projectCount: 6,
      activeTaskCount: 14,
      blockedCount: 3,
      flow: ["Collect", "Review", "Approve", "File", "Link to Oracle", "Audit"],
      sampleProjects: ["งานเอกสาร", "ต้นทุน", "ภาษี", "สัญญา"],
    },
  ],
  projectFlow: [
    {
      id: "flow-intake",
      label: "Intake",
      description: "รับงานใหม่ แยก area/project/owner ก่อนเริ่มทำ",
      status: "ready",
      owner: "Leo / Amy",
    },
    {
      id: "flow-scope",
      label: "Scope",
      description: "สรุปเป้าหมาย, detail, definition of done, dependency",
      status: "active",
      owner: "Project Room",
    },
    {
      id: "flow-execute",
      label: "Execute",
      description: "คนหรือ agent รับ task/subtask ตาม role พร้อม run log",
      status: "active",
      owner: "Assigned owner",
    },
    {
      id: "flow-review",
      label: "Review",
      description: "งานเสี่ยง, tool, budget, external action ต้องผ่าน approval",
      status: "watch",
      owner: "HELM / Leo / Amy",
    },
    {
      id: "flow-close",
      label: "Archive",
      description: "สรุปผล, link artifact, update Oracle, close token context",
      status: "ready",
      owner: "Oracle Team",
    },
  ],
  agentUseCases24x7: [
    {
      id: "usecase-oracle-housekeeper",
      title: "Oracle Housekeeper",
      agent: "David / Oracle Agent Team",
      cadence: "ทุก 6 ชั่วโมง",
      approvalGate: "อ่าน/สรุปได้ทันที, การย้าย/แก้ไฟล์ต้องขอ approval",
      output: "project capsule, decision log, stale-context report, duplicate-topic proposal",
      status: "ready",
    },
    {
      id: "usecase-project-flow-pm",
      title: "Project Flow PM",
      agent: "KaijuPM",
      cadence: "ทุก 2 ชั่วโมง",
      approvalGate: "สร้าง issue draft ได้, เปลี่ยน owner/status สำคัญต้อง approval",
      output: "blocked work, overdue work, next-action queue per person/project",
      status: "ready",
    },
    {
      id: "usecase-commerce-ops-monitor",
      title: "Commerce Ops Monitor",
      agent: "Commerce Ops Agent",
      cadence: "ทุก 30 นาทีในเวลางาน",
      approvalGate: "stock/formula/finance mutations เป็น draft จนกว่า Leo/Amy/HELM อนุมัติ",
      output: "packing queue, stock risk, production batch draft, operator task summary",
      status: "draft",
    },
  ],
  oracleHandoff: {
    status: "ready_for_agents",
    owner: "David / HELM",
    targetInbox: "ψ/memory/helm/inbox/2026-04-29_oracle-agent-team-company-os-handoff.md",
    nextAction: "Oracle Agent Team เริ่มจัดบ้าน: แยก project capsule, owner queue, stale run/token report และเสนอ intent ผ่าน Oracle Bridge",
    sourcePaths: [
      "ops/docs/KAIJU-COMPANY-OS-STARTPROJECT-v0.md",
      "ops/docs/WORK-ORGANIZATION-MODEL-v0.md",
      "ψ/state/company-os/work-map-state.example.json",
    ],
  },
};

function hasWorkMapData(workMap?: WorkMapSnapshot): boolean {
  return Boolean(
    workMap
    && (
      (Array.isArray(workMap.peopleQueues) && workMap.peopleQueues.length)
      || (Array.isArray(workMap.workAreas) && workMap.workAreas.length)
      || (Array.isArray(workMap.projectFlow) && workMap.projectFlow.length)
      || (Array.isArray(workMap.agentUseCases24x7) && workMap.agentUseCases24x7.length)
      || (workMap.decisionQueue && Array.isArray(workMap.decisionQueue.briefs))
    ),
  );
}

const OPEN_DECISION_STATUSES = new Set(["pending", "draft_context_needed", "request_changes", "deferred"]);

function isOpenDecisionStatus(status?: string): boolean {
  return OPEN_DECISION_STATUSES.has(String(status || "pending"));
}

function toneColor(tone?: string): string {
  if (tone === "product") return "#f97316";
  if (tone === "commerce") return "#22c55e";
  if (tone === "content") return "#a78bfa";
  if (tone === "finance") return "#38bdf8";
  if (tone === "ops") return "#eab308";
  if (tone === "governance") return "#fb7185";
  return "#64748b";
}

function statusColor(status?: string): string {
  if (status === "ready" || status === "live" || status === "ready_for_agents") return "#22c55e";
  if (status === "active" || status === "watch" || status === "in_progress") return "#f59e0b";
  if (status === "blocked") return "#ef4444";
  return "#64748b";
}

function surfaceLabel(surface?: string): string {
  if (surface === "control_tower") return "Control Tower";
  if (surface === "project_room") return "Project Room";
  if (surface === "commerce_office") return "Commerce Office";
  if (surface === "oracle_team") return "Oracle Team";
  return surface || "Surface";
}

interface WorkOrganizationOverviewProps {
  workMap?: WorkMapSnapshot;
  onDecisionAction?: (id: string, status: "approved" | "rejected" | "request_changes" | "deferred", decisionComment?: string, selectedOptionId?: string) => void;
  busyDecisionId?: string;
}

export function WorkOrganizationOverview({ workMap, onDecisionAction, busyDecisionId }: WorkOrganizationOverviewProps) {
  const source = hasWorkMapData(workMap) ? workMap as WorkMapSnapshot : FALLBACK_WORK_MAP;
  const data: WorkMapSnapshot = {
    ...FALLBACK_WORK_MAP,
    ...source,
    hierarchy: Array.isArray(source.hierarchy) ? source.hierarchy : FALLBACK_WORK_MAP.hierarchy,
    peopleQueues: Array.isArray(source.peopleQueues) ? source.peopleQueues : FALLBACK_WORK_MAP.peopleQueues,
    workAreas: Array.isArray(source.workAreas) ? source.workAreas : FALLBACK_WORK_MAP.workAreas,
    projectFlow: Array.isArray(source.projectFlow) ? source.projectFlow : FALLBACK_WORK_MAP.projectFlow,
    agentUseCases24x7: Array.isArray(source.agentUseCases24x7) ? source.agentUseCases24x7 : FALLBACK_WORK_MAP.agentUseCases24x7,
    oracleHandoff: source.oracleHandoff || FALLBACK_WORK_MAP.oracleHandoff,
    decisionQueue: source.decisionQueue || FALLBACK_WORK_MAP.decisionQueue,
  };
  const totalProjects = data.workAreas.reduce((sum, area) => sum + area.projectCount, 0);
  const totalTasks = data.workAreas.reduce((sum, area) => sum + area.activeTaskCount, 0);
  const totalBlocked = data.workAreas.reduce((sum, area) => sum + area.blockedCount, 0);
  const readyAgents = data.agentUseCases24x7.filter((item) => item.status === "ready" || item.status === "live").length;
  const decisionQueue = data.decisionQueue || FALLBACK_WORK_MAP.decisionQueue;
  const openDecisionBriefs = (decisionQueue.briefs || []).filter((brief) => isOpenDecisionStatus(brief.status));
  const criticalOpenDecisionCount = openDecisionBriefs.filter((brief) => brief.riskLevel === "critical").length;

  return (
    <section className="rounded-lg border border-cyan-200/10 bg-[#0b0f18] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-cyan-200/65">Overall Work Map</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">งานทั้งบริษัท แยกคน แยกแผนก แยก project</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
            Dashboard แรกต้องตอบให้ได้ทันทีว่าใครกำลังทำอะไร project ไหนอยู่ stage ไหน งานไหนติด approval และ agent ตัวไหนพร้อมวิ่ง 24/7 โดยไม่ปน context ข้าม project
          </p>
        </div>
        <div className="grid min-w-[280px] grid-cols-2 gap-2">
          <OverviewStat label="Projects" value={`${totalProjects}`} tone="#67e8f9" />
          <OverviewStat label="Active tasks" value={`${totalTasks}`} tone="#fbbf24" />
          <OverviewStat label="Blocked" value={`${totalBlocked}`} tone={totalBlocked > 0 ? "#ef4444" : "#22c55e"} />
          <OverviewStat label="24/7 agents" value={`${readyAgents}/${data.agentUseCases24x7.length}`} tone="#a78bfa" />
          <OverviewStat label="CEO decisions" value={`${openDecisionBriefs.length}`} tone={criticalOpenDecisionCount > 0 ? "#fb7185" : "#67e8f9"} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-4">
          <WorkHierarchy items={data.hierarchy} />
          <WorkAreas areas={data.workAreas} />
          <ProjectFlow steps={data.projectFlow} />
        </div>
        <div className="space-y-4">
          {decisionQueue && (
            <DecisionQueue
              data={decisionQueue}
              onDecisionAction={onDecisionAction}
              busyDecisionId={busyDecisionId}
            />
          )}
          <PeopleQueues people={data.peopleQueues} />
          <AgentUseCases items={data.agentUseCases24x7} />
          <OracleHandoff data={data.oracleHandoff} />
        </div>
      </div>
    </section>
  );
}

function DecisionQueue({ data, onDecisionAction, busyDecisionId }: {
  data: DecisionQueueSnapshot;
  onDecisionAction?: (id: string, status: "approved" | "rejected" | "request_changes" | "deferred", decisionComment?: string, selectedOptionId?: string) => void;
  busyDecisionId?: string;
}) {
  const openBriefs = data.briefs.filter((brief) => isOpenDecisionStatus(brief.status));
  const criticalOpenCount = openBriefs.filter((brief) => brief.riskLevel === "critical").length;
  const color = criticalOpenCount > 0 ? "#fb7185" : statusColor(data.status);
  return (
    <div className="rounded-lg border bg-white/[0.025] p-3" style={{ borderColor: `${color}38` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">CEO Decision Queue</div>
        <span className="text-[10px] uppercase tracking-[1px]" style={{ color }}>{openBriefs.length} open</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/50">{data.summary}</p>
      <div className="mt-3 space-y-2">
        {openBriefs.slice(0, 3).map((brief) => (
          <CompactDecisionBriefCard
            key={brief.id}
            brief={brief}
            busy={busyDecisionId === brief.id}
            onDecisionAction={onDecisionAction}
          />
        ))}
        {openBriefs.length === 0 && <div className="rounded-lg border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">No CEO decisions waiting</div>}
      </div>
    </div>
  );
}

function CompactDecisionBriefCard({ brief, busy, onDecisionAction }: {
  brief: DecisionBrief;
  busy: boolean;
  onDecisionAction?: (id: string, status: "approved" | "rejected" | "request_changes" | "deferred", decisionComment?: string, selectedOptionId?: string) => void;
}) {
  const [decisionComment, setDecisionComment] = useState("");
  const riskColor = brief.riskLevel === "critical" ? "#fb7185" : brief.riskLevel === "high" ? "#f97316" : "#f59e0b";
  const recommended = brief.options?.find((option) => option.id === brief.recommendedOption || option.recommended);
  const choices = brief.options ?? [];
  const defaultOptionId = String(brief.selectedOptionId || recommended?.id || brief.recommendedOption || choices[0]?.id || "");
  const [selectedOptionId, setSelectedOptionId] = useState(defaultOptionId);
  const activeOptionId = selectedOptionId || defaultOptionId;
  const submitDecision = (status: "approved" | "rejected" | "request_changes" | "deferred") => {
    onDecisionAction?.(brief.id, status, decisionComment, activeOptionId || undefined);
    setDecisionComment("");
  };

  return (
    <div className="rounded-lg border bg-black/20 p-3" style={{ borderColor: `${riskColor}34` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white/86">{brief.title}</div>
          <div className="mt-1 text-xs text-white/35">
            {brief.decisionOwner} | {brief.sourceRef || brief.urgency}
            {(brief.assignedAgentName || brief.assignedAgentId) && ` | Agent: ${brief.assignedAgentName || brief.assignedAgentId}`}
          </div>
        </div>
        <span className="shrink-0 rounded border px-2 py-1 text-[10px] uppercase tracking-[1px]" style={{ borderColor: `${riskColor}55`, color: riskColor }}>
          {brief.riskLevel}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-white/58">{brief.plainLanguageQuestion}</p>
      {brief.contextShort && <p className="mt-2 text-xs leading-5 text-white/42">{brief.contextShort}</p>}
      <div className="mt-2 rounded border border-cyan-200/10 bg-cyan-200/[0.035] px-2.5 py-2 text-xs leading-5 text-cyan-100/68">
        Recommend: {recommended?.label || brief.recommendedOption || "review options"}
      </div>
      {choices.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-2">
          {choices.slice(0, 4).map((option) => {
            const selected = option.id === activeOptionId;
            const optionText = option.meaning || option.impact || "เลือกทางนี้แล้วทีมจะใช้เป็นค่าหลักในการทำงานต่อ";
            return (
              <button
                key={option.id}
                type="button"
                className="rounded border bg-black/20 px-2.5 py-2 text-left text-xs leading-5 transition hover:bg-white/[0.045]"
                style={{ borderColor: selected ? "#67e8f970" : "rgba(255,255,255,0.08)" }}
                onClick={() => setSelectedOptionId(option.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={selected ? "font-semibold text-cyan-100" : "font-semibold text-white/70"}>{option.label}</span>
                  {selected && <span className="shrink-0 rounded border border-cyan-200/25 px-1.5 py-0.5 text-[9px] uppercase tracking-[1px] text-cyan-100">selected</span>}
                </div>
                <div className="mt-1 text-white/45">{optionText}</div>
              </button>
            );
          })}
        </div>
      )}
      {brief.whyThisMatters && (
        <div className="mt-2 rounded border border-amber-300/10 bg-amber-300/[0.045] px-2.5 py-2 text-xs leading-5 text-amber-100/65">
          Why: {brief.whyThisMatters}
        </div>
      )}
      <p className="mt-2 text-xs leading-5 text-white/40">{brief.nextActionAfterDecision}</p>
      <div className="mt-3 rounded-lg border border-cyan-200/15 bg-cyan-200/[0.035] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-cyan-100/78">Decision Brief / Comment</div>
          <div className="text-[10px] text-white/32">ส่งต่อให้ทีมเห็นพร้อม decision</div>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/45">
          เขียนเงื่อนไขสั้นๆ เช่น อนุมัติได้ แต่ต้องมี token cap, owner, deadline หรือสิ่งที่ต้องตรวจซ้ำก่อนลงมือจริง
        </p>
        <textarea
          className="mt-2 h-24 w-full resize-none rounded border border-white/10 bg-black/30 px-2.5 py-2 text-xs leading-5 text-white/72 outline-none placeholder:text-white/28 focus:border-cyan-200/45"
          placeholder="ตัวอย่าง: approve ตามค่าหลัก แต่ให้ HELM ตรวจ riskClass และให้ David link artifact ก่อนเริ่ม write path"
          value={decisionComment}
          onChange={(event) => setDecisionComment(event.target.value)}
        />
      </div>
      {onDecisionAction && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <DecisionButton label="Approve" disabled={busy} tone="#22c55e" onClick={() => submitDecision("approved")} />
          <DecisionButton label="Changes" disabled={busy} tone="#f59e0b" onClick={() => submitDecision("request_changes")} />
          <DecisionButton label="Defer" disabled={busy} tone="#38bdf8" onClick={() => submitDecision("deferred")} />
          <DecisionButton label="Reject" disabled={busy} tone="#fb7185" onClick={() => submitDecision("rejected")} />
        </div>
      )}
    </div>
  );
}

function DecisionButton({ label, tone, disabled, onClick }: {
  label: string;
  tone: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded border px-2.5 py-2 text-xs font-semibold transition hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-45"
      style={{ borderColor: `${tone}45`, color: tone }}
      disabled={disabled}
      onClick={onClick}
    >
      {disabled ? "Saving..." : label}
    </button>
  );
}

function OverviewStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[1.4px] text-white/34">{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function WorkHierarchy({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">Work Hierarchy</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="flex items-center gap-2">
            <span className="rounded border border-white/[0.08] bg-black/25 px-2.5 py-1.5 text-xs text-white/65">{item}</span>
            {index < items.length - 1 && <span className="text-white/20">/</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkAreas({ areas }: { areas: WorkAreaSnapshot[] }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">Work Areas</div>
        <div className="text-[11px] text-white/28">{areas.length} areas</div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {areas.map((area) => {
          const color = toneColor(area.tone);
          return (
            <div key={area.id} className="rounded-lg border bg-black/20 p-3" style={{ borderColor: `${color}38` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white/88">{area.title}</div>
                  <div className="mt-1 text-xs text-white/38">{area.owner}</div>
                </div>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MiniStat label="project" value={`${area.projectCount}`} />
                <MiniStat label="task" value={`${area.activeTaskCount}`} />
                <MiniStat label="blocked" value={`${area.blockedCount}`} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {area.flow.slice(0, 8).map((stage) => (
                  <span key={stage} className="rounded border border-white/[0.06] bg-white/[0.035] px-2 py-1 text-[10px] text-white/45">{stage}</span>
                ))}
              </div>
              <div className="mt-3 text-xs leading-5 text-white/38">{area.sampleProjects.join(", ")}</div>
            </div>
          );
        })}
        {areas.length === 0 && <div className="rounded-lg border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">No work areas yet</div>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/[0.06] bg-white/[0.025] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[1px] text-white/26">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-white/78">{value}</div>
    </div>
  );
}

function ProjectFlow({ steps }: { steps: ProjectFlowStep[] }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">Project Flow</div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-5">
        {steps.map((step) => {
          const color = statusColor(step.status);
          return (
            <div key={step.id} className="rounded-lg border bg-black/20 p-3" style={{ borderColor: `${color}35` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold text-white/82">{step.label}</div>
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              </div>
              <p className="mt-2 min-h-[56px] text-xs leading-5 text-white/42">{step.description}</p>
              <div className="mt-2 truncate text-[11px] text-white/30">{step.owner}</div>
            </div>
          );
        })}
        {steps.length === 0 && <div className="rounded-lg border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">No project flow yet</div>}
      </div>
    </div>
  );
}

function PeopleQueues({ people }: { people: WorkPersonQueue[] }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">Person Queues</div>
      <div className="space-y-2">
        {people.map((person) => (
          <div key={person.id} className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white/85">{person.name}</div>
                <div className="mt-1 text-xs text-white/35">{surfaceLabel(person.surface)} | {person.role}</div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded border border-white/[0.07] bg-white/[0.035] px-2 py-1 text-white/54">{person.openCount} open</span>
                <span className="rounded border border-red-300/20 bg-red-500/10 px-2 py-1 text-red-100/70">{person.blockedCount} blocked</span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">{person.focus}</p>
            <div className="mt-2 rounded border border-cyan-200/10 bg-cyan-200/[0.035] px-2.5 py-2 text-xs leading-5 text-cyan-100/68">{person.nextAction}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentUseCases({ items }: { items: AgentUseCase24x7[] }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">24/7 Agent Use Cases</div>
      <div className="space-y-2">
        {items.map((item) => {
          const color = statusColor(item.status);
          return (
            <div key={item.id} className="rounded-lg border bg-black/20 p-3" style={{ borderColor: `${color}32` }}>
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold text-white/85">{item.title}</div>
                <span className="text-[10px] uppercase tracking-[1px]" style={{ color }}>{item.status}</span>
              </div>
              <div className="mt-1 text-xs text-white/35">{item.agent} | {item.cadence}</div>
              <p className="mt-2 text-xs leading-5 text-white/45">{item.output}</p>
              <div className="mt-2 rounded border border-amber-300/15 bg-amber-300/[0.055] px-2.5 py-2 text-xs leading-5 text-amber-100/65">{item.approvalGate}</div>
            </div>
          );
        })}
        {items.length === 0 && <div className="rounded-lg border border-white/[0.07] bg-black/20 p-4 text-sm text-white/35">No agent use cases yet</div>}
      </div>
    </div>
  );
}

function OracleHandoff({ data }: { data: WorkMapSnapshot["oracleHandoff"] }) {
  const color = statusColor(data.status);
  return (
    <div className="rounded-lg border bg-white/[0.025] p-3" style={{ borderColor: `${color}38` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[1.7px] text-white/45">Oracle Handoff</div>
        <span className="text-[10px] uppercase tracking-[1px]" style={{ color }}>{data.status}</span>
      </div>
      <div className="mt-3 text-sm font-semibold text-white/82">{data.owner}</div>
      <div className="mt-1 break-words text-xs text-white/35">{data.targetInbox}</div>
      <p className="mt-3 text-xs leading-5 text-white/50">{data.nextAction}</p>
      <div className="mt-3 space-y-1">
        {data.sourcePaths.slice(0, 5).map((path) => (
          <div key={path} className="truncate rounded border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[11px] text-white/36">{path}</div>
        ))}
      </div>
    </div>
  );
}

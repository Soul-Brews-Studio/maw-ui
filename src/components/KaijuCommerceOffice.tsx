import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiUrl } from "../lib/api";
import {
  EMPTY_COMMERCE_OFFICE_STATE,
  type CommerceOfficeState,
  type OperatorTask,
  type ProductionBatchDraft,
  type StockMovementDraft,
} from "../lib/commerceOfficeTypes";

type DraftKind = "packing" | "stock" | "production";

function statusColor(status?: string) {
  if (status === "done" || status === "active") return "#22c55e";
  if (status === "doing" || status === "pending_approval" || status === "review") return "#f59e0b";
  if (status === "blocked" || status === "cancelled") return "#ef4444";
  return "#94a3b8";
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

export function KaijuCommerceOffice() {
  const [state, setState] = useState<CommerceOfficeState>(EMPTY_COMMERCE_OFFICE_STATE);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await apiRequest<CommerceOfficeState>("/commerce-office/staff-view");
      setState({ ...EMPTY_COMMERCE_OFFICE_STATE, ...data });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const todoTasks = state.operatorTasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const pendingDrafts = [
    ...state.stockMovementDrafts.filter((draft) => draft.approvalRequired),
    ...state.productionBatchDrafts.filter((draft) => draft.approvalRequired),
  ];

  return (
    <main className="min-h-screen bg-[#05070d] px-4 py-5 text-white lg:px-6">
      <div className="mx-auto max-w-[1600px] space-y-4">
        <section className="rounded-lg border border-white/[0.08] bg-[#0b0f18] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[2.4px] text-cyan-200/55">Kaiju Commerce Office</div>
              <h1 className="mt-1 text-3xl font-semibold text-white">พื้นที่ทำงานจริงของออเดอร์ สต็อก แพ็คของ และผลิต</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/58">
                หน้านี้แยกจาก Control Tower เพื่อให้พนักงานทำงานเฉพาะ operation ได้ตาม role: เห็นงานที่ต้องทำ สร้าง draft และรอ Leo/Amy/HELM อนุมัติก่อนเกิดผลกับ stock หรือ production จริง.
              </p>
            </div>
            <div className="grid min-w-[320px] grid-cols-3 gap-2">
              <TopStat label="งานเปิด" value={`${todoTasks.length}`} tone={todoTasks.length ? "watch" : "ok"} />
              <TopStat label="draft รออนุมัติ" value={`${pendingDrafts.length}`} tone={pendingDrafts.length ? "watch" : "ok"} />
              <TopStat label="โหมดพนักงาน" value={state.staffAccess.defaultRole} tone="ok" />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <QuickAction
            title="สร้างงานแพ็คของ"
            body="เพิ่ม task ให้พนักงานแพ็ค ตรวจ และบันทึกสถานะ"
            disabled={!!busy}
            onClick={() => run("packing", () => createDraft("packing"))}
          />
          <QuickAction
            title="สร้าง stock count draft"
            body="บันทึกผลนับสต็อกเป็น draft เพื่อรออนุมัติก่อนเข้าบัญชี stock"
            disabled={!!busy}
            onClick={() => run("stock", () => createDraft("stock"))}
          />
          <QuickAction
            title="สร้าง production batch draft"
            body="เริ่ม batch ผลิต/ผสมสูตรแบบ draft เพื่อรออนุมัติผลกระทบ stock"
            disabled={!!busy}
            onClick={() => run("production", () => createDraft("production"))}
          />
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
          <section className="space-y-4">
            <Panel title="Operator Work Queue" meta={`${state.operatorTasks.length} tasks`}>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {state.operatorTasks.map((task) => (
                  <OperatorTaskCard
                    key={task.id}
                    task={task}
                    disabled={!!busy}
                    onStatus={(status) => run(`task-${task.id}`, () => apiRequest(`/commerce-office/operator-tasks/${task.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ status, updatedBy: "staff-operator-01" }),
                    }))}
                  />
                ))}
                {state.operatorTasks.length === 0 && <Empty label="ยังไม่มีงานในคิว" />}
              </div>
            </Panel>

            <Panel title="Stock Movement Drafts" meta={`${state.stockMovementDrafts.length} drafts`}>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {state.stockMovementDrafts.map((draft) => <StockDraftCard key={draft.id} draft={draft} />)}
                {state.stockMovementDrafts.length === 0 && <Empty label="ยังไม่มี stock draft" />}
              </div>
            </Panel>
          </section>

          <section className="space-y-4">
            <Panel title="Production Drafts" meta={`${state.productionBatchDrafts.length}`}>
              <div className="space-y-2">
                {state.productionBatchDrafts.map((draft) => <ProductionDraftCard key={draft.id} draft={draft} />)}
                {state.productionBatchDrafts.length === 0 && <Empty label="ยังไม่มี production draft" />}
              </div>
            </Panel>

            <Panel title="Staff Boundary" meta="role-based">
              <div className="space-y-3 text-sm">
                <BoundaryRow label="เห็นได้" value={state.staffAccess.allowedSurfaces.join(", ")} tone="ok" />
                <BoundaryRow label="ไม่เห็น" value={state.staffAccess.blockedSurfaces.join(", ")} tone="blocked" />
              </div>
            </Panel>
          </section>
        </div>
      </div>
    </main>
  );

  function createDraft(kind: DraftKind) {
    if (kind === "packing") {
      return apiRequest<OperatorTask>("/commerce-office/work-queue", {
        method: "POST",
        body: JSON.stringify({
          type: "packing",
          title: "แพ็คออเดอร์ใหม่",
          assignee: "staff-operator-01",
          instructions: "ตรวจสินค้า แพ็คให้ครบ ถ่ายรูป/จด tracking แล้วส่งให้ Amy ตรวจ",
          createdBy: "Amy",
        }),
      });
    }
    if (kind === "stock") {
      return apiRequest<{ draft: StockMovementDraft }>("/commerce-office/stock-drafts", {
        method: "POST",
        body: JSON.stringify({
          type: "cycle_count",
          sku: "SAMPLE-SKU",
          warehouse: "main",
          quantity: 0,
          reason: "Operator stock count draft",
          createdBy: "staff-operator-01",
        }),
      });
    }
    return apiRequest<{ draft: ProductionBatchDraft }>("/commerce-office/production-batches", {
      method: "POST",
      body: JSON.stringify({
        formulaId: "formula-sample",
        outputSku: "SAMPLE-FINISHED-GOOD",
        plannedQty: 0,
        qcNotes: "Operator production log draft",
        createdBy: "staff-operator-01",
      }),
    });
  }
}

function TopStat({ label, value, tone }: { label: string; value: string; tone: "ok" | "watch" | "blocked" }) {
  const color = tone === "ok" ? "#22c55e" : tone === "watch" ? "#f59e0b" : "#ef4444";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2">
      <div className="text-[11px] text-white/38">{label}</div>
      <div className="mt-1 font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

function QuickAction({ title, body, disabled, onClick }: { title: string; body: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4 text-left transition hover:border-cyan-200/45 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      <div className="text-base font-semibold text-cyan-50">{title}</div>
      <div className="mt-2 text-sm leading-6 text-cyan-50/55">{body}</div>
    </button>
  );
}

function Panel({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <span className="rounded border border-white/[0.07] bg-black/25 px-2 py-1 text-xs text-white/40">{meta}</span>
      </div>
      {children}
    </section>
  );
}

function OperatorTaskCard({ task, disabled, onStatus }: { task: OperatorTask; disabled: boolean; onStatus: (status: string) => void }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-white/82">{task.title}</h3>
        <span className="text-xs" style={{ color: statusColor(task.status) }}>{task.status}</span>
      </div>
      <div className="mt-2 text-xs text-white/35">{task.type} | {task.priority} | {task.assignee}</div>
      <p className="mt-3 text-sm leading-6 text-white/55">{task.instructions}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded border border-white/10 px-2.5 py-1.5 text-xs text-white/65 disabled:opacity-40" disabled={disabled} onClick={() => onStatus("doing")}>Start</button>
        <button className="rounded border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1.5 text-xs text-emerald-100 disabled:opacity-40" disabled={disabled} onClick={() => onStatus("done")}>Done</button>
        <button className="rounded border border-red-300/25 bg-red-300/10 px-2.5 py-1.5 text-xs text-red-100 disabled:opacity-40" disabled={disabled} onClick={() => onStatus("blocked")}>Block</button>
      </div>
    </div>
  );
}

function StockDraftCard({ draft }: { draft: StockMovementDraft }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-white/82">{draft.sku}</h3>
        <span className="text-xs" style={{ color: statusColor(draft.status) }}>{draft.status}</span>
      </div>
      <div className="mt-2 text-xs text-white/35">{draft.type} | {draft.warehouse} | qty {draft.quantity}</div>
      <div className="mt-2 text-sm leading-6 text-white/52">{draft.reason}</div>
      {draft.approvalId && <div className="mt-2 text-xs text-amber-100/65">approval {draft.approvalId}</div>}
    </div>
  );
}

function ProductionDraftCard({ draft }: { draft: ProductionBatchDraft }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-white/82">{draft.outputSku}</h3>
        <span className="text-xs" style={{ color: statusColor(draft.status) }}>{draft.status}</span>
      </div>
      <div className="mt-2 text-xs text-white/35">{draft.formulaId} | planned {draft.plannedQty}</div>
      {draft.qcNotes && <div className="mt-2 text-sm leading-6 text-white/52">{draft.qcNotes}</div>}
      {draft.approvalId && <div className="mt-2 text-xs text-amber-100/65">approval {draft.approvalId}</div>}
    </div>
  );
}

function BoundaryRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "blocked" }) {
  const color = tone === "ok" ? "#22c55e" : "#ef4444";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
      <div className="text-xs" style={{ color }}>{label}</div>
      <div className="mt-1 leading-6 text-white/55">{value || "none"}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3 text-sm text-white/35">{label}</div>;
}

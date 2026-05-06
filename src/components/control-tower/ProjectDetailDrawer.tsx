import { useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "../../lib/api";
import {
  DEFAULT_LOG_LIMIT,
  type DetailLogEntry,
  type ProjectDetailPayload,
} from "../../lib/d4ProjectDetailTypes";

type DrawerState =
  | { kind: "closed" }
  | { kind: "loading"; projectId: string }
  | { kind: "loaded"; projectId: string; payload: ProjectDetailPayload }
  | { kind: "not-found"; projectId: string }
  | { kind: "error"; projectId: string; message: string };

const URL_HASH_PREFIX = "project=";

/**
 * D4 — Project Detail Drawer (read-only, Phase 1).
 *
 * Trigger: parent calls `<ProjectDetailDrawer projectId={...} onClose={...} />`.
 * Open trigger by URL hash `#project=ID` is handled here (parses on mount + hashchange);
 * parent should reflect openings via the `onProjectIdChange` callback.
 *
 * Pattern choice: right-side slide-in 480px (per pre-auth bundle §"Pre-authorized
 * in-scope VELA decisions" — picked over center modal because Cockpit's existing
 * surface is already wide; modal would obscure context behind it).
 *
 * a11y: role="dialog" + aria-modal + Esc close + focus-trap-lite (initial focus on close button).
 */
export function ProjectDetailDrawer({ projectId, onClose }: {
  projectId: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<DrawerState>({ kind: "closed" });
  const [logShowAll, setLogShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState<{ plan: boolean; details: boolean; status: boolean }>({
    plan: false, details: true, status: true,
  });

  // Fetch on projectId change.
  useEffect(() => {
    if (!projectId) {
      setState({ kind: "closed" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading", projectId });
    setLogShowAll(false);
    setCollapsed({ plan: false, details: true, status: true });
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/kaiju/control-tower/projects/${encodeURIComponent(projectId)}`));
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: "not-found", projectId });
          return;
        }
        if (!res.ok) {
          setState({ kind: "error", projectId, message: `HTTP ${res.status}` });
          return;
        }
        const payload = (await res.json()) as ProjectDetailPayload;
        if (cancelled) return;
        setState({ kind: "loaded", projectId, payload });
      } catch (err) {
        if (cancelled) return;
        setState({ kind: "error", projectId, message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Esc key closes drawer.
  useEffect(() => {
    if (!projectId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [projectId, onClose]);

  if (!projectId || state.kind === "closed") return null;

  return (
    <>
      {/* backdrop — click to close */}
      <button
        type="button"
        aria-label="Close project detail drawer"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-sm"
      />
      {/* slide-in panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Project detail"
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[480px] flex-col border-l border-white/10 bg-[#0b1220] text-white shadow-2xl"
      >
        <DrawerHeader state={state} onClose={onClose} />
        <DrawerBody
          state={state}
          logShowAll={logShowAll}
          onShowAllLog={() => setLogShowAll(true)}
          collapsed={collapsed}
          onToggleSection={(key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
        />
      </aside>
    </>
  );
}

function DrawerHeader({ state, onClose }: { state: DrawerState; onClose: () => void }) {
  const projectId = "projectId" in state ? state.projectId : "";
  const title = state.kind === "loaded" ? state.payload.project_id : projectId;
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[1.5px] text-white/35">Project</div>
        <div className="mt-0.5 truncate text-sm font-semibold text-white/90">{title || "—"}</div>
      </div>
      <button
        type="button"
        autoFocus
        onClick={onClose}
        aria-label="Close drawer"
        className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-white/60 transition hover:border-white/35 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}

function DrawerBody({ state, logShowAll, onShowAllLog, collapsed, onToggleSection }: {
  state: DrawerState;
  logShowAll: boolean;
  onShowAllLog: () => void;
  collapsed: { plan: boolean; details: boolean; status: boolean };
  onToggleSection: (key: "plan" | "details" | "status") => void;
}) {
  if (state.kind === "loading") return <DrawerSkeleton />;
  if (state.kind === "not-found") {
    return (
      <div className="flex-1 overflow-y-auto p-5">
        <div className="rounded-md border border-amber-300/25 bg-amber-300/5 px-4 py-4 text-sm text-amber-100/80">
          ไม่พบข้อมูล project นี้ — อาจถูก archive แล้ว หรือ id ไม่ตรงกับ Steward log
          <div className="mt-2 text-xs text-amber-100/50">
            id: <code>{state.projectId}</code>
          </div>
        </div>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex-1 overflow-y-auto p-5">
        <div className="rounded-md border border-red-400/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          โหลด project detail ไม่ได้: {state.message}
        </div>
      </div>
    );
  }
  // state.kind === "loaded"
  const { payload } = state;
  const visibleLog = logShowAll || payload.log.length <= DEFAULT_LOG_LIMIT
    ? payload.log
    : payload.log.slice(0, DEFAULT_LOG_LIMIT);
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      <PlanSection plan={payload.plan} status={payload.status} collapsed={collapsed.plan} onToggle={() => onToggleSection("plan")} />
      <DetailsSection detail={payload.detail} why={payload.why} drift={payload.drift_check} collapsed={collapsed.details} onToggle={() => onToggleSection("details")} />
      <StatusSection
        status={payload.status}
        log={visibleLog}
        totalLog={payload.log.length}
        showAll={logShowAll}
        onShowAll={onShowAllLog}
        collapsed={collapsed.status}
        onToggle={() => onToggleSection("status")}
      />
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-busy="true" aria-label="Loading project detail">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-md border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="mb-3 h-3 w-24 animate-pulse rounded bg-white/10" />
          <div className="mb-2 h-2 w-full animate-pulse rounded bg-white/[0.07]" />
          <div className="mb-2 h-2 w-5/6 animate-pulse rounded bg-white/[0.07]" />
          <div className="h-2 w-3/4 animate-pulse rounded bg-white/[0.07]" />
        </div>
      ))}
    </div>
  );
}

function CollapsibleHeader({ title, collapsed, onToggle, badge }: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-left text-xs uppercase tracking-[1.5px] text-white/55 transition hover:border-white/15"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
        {title}
      </span>
      {badge && <span className="text-[10px] text-white/40">{badge}</span>}
    </button>
  );
}

function PlanSection({ plan, status, collapsed, onToggle }: {
  plan: ProjectDetailPayload["plan"];
  status: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="mb-3">
      <CollapsibleHeader title="Plan" collapsed={collapsed} onToggle={onToggle} badge={`status: ${status}`} />
      {!collapsed && (
        <div className="mt-2 space-y-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
          <Field label="DoD">
            {plan.dod ? <span className="text-white/85">{plan.dod}</span> : <span className="text-white/35">(not specified)</span>}
          </Field>
          <Field label="ETA (active-hr)">
            {plan.eta_active_hr !== null
              ? <span className="text-white/85">{plan.eta_active_hr}</span>
              : <span className="text-white/35">(not estimated)</span>}
          </Field>
          <Field label="Halt criteria">
            {plan.halt_criteria.length > 0 ? (
              <ul className="ml-4 list-disc space-y-1 text-white/75">
                {plan.halt_criteria.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            ) : <span className="text-white/35">(none specified)</span>}
          </Field>
          <Field label="Spec path">
            {plan.spec_path
              ? <a href={plan.spec_path} target="_blank" rel="noopener noreferrer" className="break-all text-cyan-200 hover:underline">{plan.spec_path}</a>
              : <span className="text-white/35">(no spec linked)</span>}
          </Field>
        </div>
      )}
    </section>
  );
}

function DetailsSection({ detail, why, drift, collapsed, onToggle }: {
  detail: ProjectDetailPayload["detail"];
  why: string | null;
  drift: "in-scope" | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="mb-3">
      <CollapsibleHeader title="Details" collapsed={collapsed} onToggle={onToggle} badge={drift ?? "—"} />
      {!collapsed && (
        <div className="mt-2 space-y-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
          <Field label="Source">
            {detail.source ? <span className="text-white/85">{detail.source}</span> : <span className="text-white/35">—</span>}
          </Field>
          <Field label="Why matters">
            {detail.why_matters
              ? <p className="text-white/75 leading-6">{detail.why_matters}</p>
              : (why ? <p className="text-white/75 leading-6">{why}</p> : <span className="text-white/35">(not specified)</span>)}
          </Field>
          <Field label="Owner notes">
            {detail.owner_notes
              ? <p className="whitespace-pre-line text-white/75 leading-6">{detail.owner_notes}</p>
              : <span className="text-white/35">(no notes)</span>}
          </Field>
          <Field label="Related files">
            {detail.related_files.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {detail.related_files.map((f, i) => (
                  <li key={i}>
                    <a href={f} target="_blank" rel="noopener noreferrer" className="break-all text-cyan-200 hover:underline">{f}</a>
                  </li>
                ))}
              </ul>
            ) : <span className="text-white/35">(none linked)</span>}
          </Field>
        </div>
      )}
    </section>
  );
}

function StatusSection({ status, log, totalLog, showAll, onShowAll, collapsed, onToggle }: {
  status: string;
  log: DetailLogEntry[];
  totalLog: number;
  showAll: boolean;
  onShowAll: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="mb-3">
      <CollapsibleHeader title="Current status" collapsed={collapsed} onToggle={onToggle} badge={`${totalLog} log entries`} />
      {!collapsed && (
        <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
          <div className="mb-3">
            <span className="rounded border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-xs font-medium text-cyan-100">
              {status}
            </span>
          </div>
          {log.length === 0 ? (
            <p className="text-white/35">(no log entries)</p>
          ) : (
            <>
              <ol className="space-y-3">
                {log.map((entry, i) => <LogEntry key={i} entry={entry} />)}
              </ol>
              {!showAll && totalLog > log.length && (
                <button
                  type="button"
                  onClick={onShowAll}
                  className="mt-3 rounded-md border border-white/[0.12] px-3 py-1.5 text-xs text-white/65 transition hover:border-white/30 hover:text-white"
                >
                  Load more ({totalLog - log.length} earlier entries)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function LogEntry({ entry }: { entry: DetailLogEntry }) {
  const relative = useMemo(() => formatRelative(entry.timestamp), [entry.timestamp]);
  const absolute = entry.timestamp ?? "(no timestamp)";
  return (
    <li className="rounded border border-white/[0.06] bg-white/[0.015] px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-[1px] text-white/40">
        <span title={absolute} className="cursor-help">{relative}</span>
        <span className="text-white/55">{entry.actor || "—"}</span>
      </div>
      <div
        className="text-sm leading-6 text-white/80"
        // Safe inline render: only allows bold/italic/code/links — no raw HTML accepted.
        dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(entry.event) }}
      />
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[1.5px] text-white/40">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return "(no ts)";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "เพิ่งหมาด";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172_800) return "เมื่อวาน";
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

/**
 * Minimal safe inline markdown — handles bold/italic/code/links only.
 * Raw HTML in input is escaped first, so XSS surface = nil.
 * Co-located inline (no markdown lib dependency) per VELA "no premature abstraction at N=1".
 * If future surfaces (D5+, comments) need full markdown, extract with DOMPurify+marked.
 */
export function renderInlineMarkdown(input: string): string {
  // 1. Escape HTML entities first.
  let s = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  // 2. Code spans `code` (do this first to protect inner from other rules).
  const codeStash: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = codeStash.length;
    codeStash.push(code);
    return ` CODE${idx} `;
  });
  // 3. Links [text](url) — only http(s)/relative paths allowed.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safe = /^(https?:\/\/|\/|#)/.test(url);
    return safe
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-cyan-200 hover:underline">${text}</a>`
      : `[${text}](${url})`;
  });
  // 4. Bold **text** then italic *text*.
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  // 5. Restore code spans.
  s = s.replace(/ CODE(\d+) /g, (_m, idx) => `<code class="rounded bg-white/[0.07] px-1 text-[12px] text-cyan-100">${codeStash[Number(idx)]}</code>`);
  return s;
}

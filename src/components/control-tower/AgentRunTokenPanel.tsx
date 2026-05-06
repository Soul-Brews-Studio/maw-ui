import type { AgentProfile, RunRecord } from "../../lib/controlTowerTypes";
import type { TokenLedger } from "../../lib/companyOsTypes";

function money(value?: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function statusColor(status?: string) {
  if (status === "done" || status === "ready") return "#22c55e";
  if (status === "running" || status === "queued" || status === "needed") return "#f59e0b";
  if (status === "failed" || status === "blocked" || status === "stale") return "#ef4444";
  return "#94a3b8";
}

export function AgentRunTokenPanel({ ledgers, runs, agents, projectId }: {
  ledgers: TokenLedger[];
  runs: RunRecord[];
  agents: AgentProfile[];
  projectId?: string;
}) {
  const visibleLedgers = projectId ? ledgers.filter((ledger) => ledger.projectId === projectId) : ledgers;
  const agentName = new Map(agents.map((agent) => [agent.id, agent.name]));

  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[2px] text-cyan-200/55">Agent Runs + Token Ledger</div>
          <h3 className="mt-1 text-lg font-semibold text-white">Context budget per project</h3>
        </div>
        <div className="rounded border border-white/[0.07] bg-black/25 px-3 py-2 text-xs text-white/45">
          {visibleLedgers.length} ledgers
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="space-y-2">
          {visibleLedgers.map((ledger) => {
            const pct = ledger.budgetTokens > 0 ? Math.min(100, (ledger.usedTokens / ledger.budgetTokens) * 100) : 0;
            return (
              <div key={ledger.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white/82">{agentName.get(ledger.agentId) || ledger.agentId}</div>
                  <div className="text-xs" style={{ color: statusColor(ledger.compactionStatus) }}>{ledger.compactionStatus}</div>
                </div>
                <div className="mt-2 h-2 rounded-full bg-white/[0.06]">
                  <div className="h-2 rounded-full bg-cyan-300/80" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-white/35">
                  <span>{ledger.usedTokens.toLocaleString()} / {ledger.budgetTokens.toLocaleString()} tok</span>
                  <span>{money(ledger.usedUsd)} / {money(ledger.budgetUsd)}</span>
                </div>
                {ledger.lastSummary && <div className="mt-2 text-xs leading-5 text-white/45">{ledger.lastSummary}</div>}
              </div>
            );
          })}
          {visibleLedgers.length === 0 && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3 text-sm text-white/35">
              No token ledger for this project yet
            </div>
          )}
        </div>

        <div className="space-y-2">
          {runs.slice(0, 6).map((run) => (
            <div key={run.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold text-white/82">{run.summary}</div>
                <div className="text-xs" style={{ color: statusColor(run.status) }}>{run.status}</div>
              </div>
              <div className="mt-2 text-xs text-white/35">
                {agentName.get(run.agentId) || run.agentName || run.agentId} | {run.tokenCount?.toLocaleString() || 0} tok | {money(run.costUsd)}
              </div>
            </div>
          ))}
          {runs.length === 0 && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3 text-sm text-white/35">
              No runs linked to this room
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

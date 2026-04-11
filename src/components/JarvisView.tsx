import { memo, useState, useEffect, useRef, useCallback } from "react";

const JARVIS_API = "/api/jarvis";

interface Conversation {
  id: number;
  userId: string;
  userMsg: string;
  botReply: string;
  intent: string;
  createdAt: string;
}

const INTENT_COLORS: Record<string, string> = {
  product: "#22d3ee", general: "#a78bfa", greeting: "#4caf50",
  insurance_query: "#22d3ee", product_info: "#a78bfa", claim: "#fbbf24",
  complaint: "#ef5350", switch_customer: "#f97316", switch_agent: "#f97316",
  signup: "#ec4899", menu: "#64748b", unknown: "#666",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h";
  return Math.floor(diff / 86400000) + "d";
}

async function fetchApi(path: string) {
  try {
    const r = await fetch(`${JARVIS_API}${path}`);
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export const JarvisView = memo(function JarvisView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [kbStats, setKBStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [products, setProducts] = useState<any>(null);
  const [errors, setErrors] = useState<any>(null);
  const [links, setLinks] = useState<any>(null);
  const [patterns, setPatterns] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"chat" | "analytics" | "epos">("chat");
  const [botEnabled, setBotEnabled] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  // Fetch core data
  const fetchData = useCallback(async () => {
    const [convRes, statsRes, kbRes, toggleRes] = await Promise.allSettled([
      fetchApi("/conversations?limit=30"),
      fetchApi("/stats"),
      fetchApi("/kb/stats"),
      fetchApi("/toggle"),
    ]);

    if (convRes.status === "fulfilled" && convRes.value) {
      const d = convRes.value;
      setConversations(d.conversations || d.sessions || d || []);
    }
    if (statsRes.status === "fulfilled" && statsRes.value) setStats(statsRes.value);
    if (kbRes.status === "fulfilled" && kbRes.value) setKBStats(kbRes.value);
    if (toggleRes.status === "fulfilled" && toggleRes.value) setBotEnabled(toggleRes.value.enabled !== false);
    setError(statsRes.status === "rejected" ? "API not reachable" : "");
    setLoading(false);
  }, []);

  // Fetch analytics (Phase 2 endpoints — graceful fallback)
  const fetchAnalytics = useCallback(async () => {
    const [anlRes, prodRes, errRes, linkRes, patRes] = await Promise.allSettled([
      fetchApi("/analytics?period=daily"),
      fetchApi("/products/ranking?limit=10"),
      fetchApi("/errors"),
      fetchApi("/links/stats"),
      fetchApi("/patterns"),
    ]);
    if (anlRes.status === "fulfilled") setAnalytics(anlRes.value);
    if (prodRes.status === "fulfilled") setProducts(prodRes.value);
    if (errRes.status === "fulfilled") setErrors(errRes.value);
    if (linkRes.status === "fulfilled") setLinks(linkRes.value);
    if (patRes.status === "fulfilled") setPatterns(patRes.value);
  }, []);

  useEffect(() => {
    fetchData();
    fetchAnalytics();
    const i1 = setInterval(fetchData, 10000);
    const i2 = setInterval(fetchAnalytics, 30000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchData, fetchAnalytics]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [conversations]);

  const toggleBot = useCallback(async () => {
    const v = !botEnabled;
    setBotEnabled(v);
    try { await fetch(`${JARVIS_API}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: v }) }); } catch {}
  }, [botEnabled]);

  const topIntents = stats?.top_intents as { intent: string; cnt: number }[] | undefined;
  const totalIntents = topIntents?.reduce((a, b) => a + b.cnt, 0) || 0;

  return (
    <div className="flex flex-col mx-2 sm:mx-4 md:mx-6 mb-3 gap-3" style={{ minHeight: "calc(100vh - 80px)" }}>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <StatCard label="Total Queries" value={stats?.total_sessions ?? "—"} color="#22d3ee" />
        <StatCard label="Today" value={stats?.messages_today ?? "—"} color="#4caf50" />
        <StatCard label="Active Users" value={stats?.active_users_today ?? "—"} color="#a78bfa" />
        <StatCard label="Unique Users" value={stats?.total_unique_users ?? "—"} color="#f97316" />
        <StatCard label="KB Chunks" value={kbStats?.total_chunks?.toLocaleString() ?? "—"} color="#8b5cf6" />
        <StatCard label="KB Links" value={kbStats?.total_links ?? "—"} color="#fbbf24" />
      </div>

      {/* ── Tabs + Bot Toggle ── */}
      <div className="flex items-center gap-1 px-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {(["chat", "analytics", "epos"] as const).map(t => {
          const cfg = { chat: { label: "Chat Feed", bg: "34,211,238" }, analytics: { label: "Analytics", bg: "168,85,247" }, epos: { label: "ePOS", bg: "251,191,36" } };
          const c = cfg[t];
          return (
            <button key={t} onClick={() => setTab(t)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={tab === t ? { background: `rgba(${c.bg},0.15)`, color: `rgb(${c.bg})`, border: `1px solid rgba(${c.bg},0.3)` } : { color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.03)" }}
            >{c.label}</button>
          );
        })}
        <button onClick={toggleBot}
          className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono active:scale-95"
          style={{ background: botEnabled ? "rgba(76,175,80,0.12)" : "rgba(239,83,80,0.12)", color: botEnabled ? "#4caf50" : "#ef5350", border: `1px solid ${botEnabled ? "rgba(76,175,80,0.25)" : "rgba(239,83,80,0.25)"}` }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: botEnabled ? "#4caf50" : "#ef5350" }} />
          {botEnabled ? "BOT ON" : "BOT OFF"}
        </button>
      </div>

      {error && <div className="mx-1 px-3 py-2 rounded-lg text-xs font-mono text-amber-400/80 bg-amber-400/10 border border-amber-400/20">⚠ {error}</div>}

      {/* ═══════════════════════════════════
           CHAT FEED TAB
         ═══════════════════════════════════ */}
      {tab === "chat" && (
        <div ref={feedRef} className="flex-1 overflow-y-auto rounded-xl border border-white/[0.06]"
          style={{ background: "#0a0a12", minHeight: 300, maxHeight: "calc(100vh - 280px)", overscrollBehavior: "contain" }}
        >
          {loading && <div className="flex items-center justify-center text-white/20 text-sm font-mono py-12">Loading...</div>}
          {!loading && conversations.length === 0 && <div className="flex items-center justify-center text-white/20 text-sm font-mono py-12">No conversations yet</div>}
          {conversations.map((conv, i) => (
            <div key={conv.id || i} className="px-3 sm:px-4 py-2.5 border-b border-white/[0.03] hover:bg-white/[0.02]">
              <div className="flex items-start gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">U</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/80 break-words">{conv.userMsg}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-white/25 font-mono">{conv.userId}</span>
                    <span className="text-[9px] text-white/20 font-mono">{conv.createdAt ? timeAgo(conv.createdAt) : ""}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 ml-7">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/60 break-words leading-relaxed">{conv.botReply || "..."}</div>
                  {conv.intent && (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-mono"
                      style={{ background: `${INTENT_COLORS[conv.intent] || "#666"}15`, color: INTENT_COLORS[conv.intent] || "#666" }}
                    >{conv.intent}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════
           ANALYTICS TAB
         ═══════════════════════════════════ */}
      {tab === "analytics" && (
        <div className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ maxHeight: "calc(100vh - 250px)", overscrollBehavior: "contain" }}>

          {/* Row 1: Conversation Analytics + Intent Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Conversation Analytics */}
            <Panel title="Conversation Analytics">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Total Sessions" value={stats?.total_sessions ?? "—"} />
                <MiniStat label="Today" value={stats?.messages_today ?? "—"} />
                <MiniStat label="Active Today" value={stats?.active_users_today ?? "—"} />
                <MiniStat label="Unique Users" value={stats?.total_unique_users ?? "—"} />
              </div>
              {/* Daily trend from analytics API */}
              {analytics?.data?.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/[0.04]">
                  <div className="text-[9px] uppercase tracking-wider text-white/25 mb-1.5">Daily Trend</div>
                  <div className="flex items-end gap-1 h-12">
                    {analytics.data.map((d: any, i: number) => {
                      const max = Math.max(...analytics.data.map((x: any) => x.messages || 0));
                      const pct = max > 0 ? ((d.messages || 0) / max) * 100 : 0;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.messages} msgs, ${d.uniqueUsers} users`}>
                          <div className="w-full rounded-t" style={{ height: `${Math.max(4, pct)}%`, background: "#22d3ee" }} />
                          <span className="text-[6px] text-white/15">{d.date?.slice(-2)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {stats?.last_interaction && (
                <div className="text-[9px] text-white/20 font-mono mt-2">Last: {timeAgo(stats.last_interaction)}</div>
              )}
            </Panel>

            {/* Intent Breakdown */}
            <Panel title="Intent Breakdown">
              {topIntents?.length ? (
                <div className="flex flex-col gap-1.5">
                  {topIntents.map(({ intent, cnt }) => {
                    const pct = totalIntents > 0 ? Math.round((cnt / totalIntents) * 100) : 0;
                    const color = INTENT_COLORS[intent] || "#666";
                    return (
                      <div key={intent} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-white/50 w-24 sm:w-28 truncate">{intent}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-[10px] font-mono text-white/40 w-14 text-right">{cnt} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              ) : <Waiting />}
            </Panel>
          </div>

          {/* Row 2: Product Ranking + Error Analysis */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Product Popularity */}
            <Panel title="Product Popularity">
              {(products?.data?.length || products?.ranking?.length) ? (
                <div className="flex flex-col gap-1.5">
                  {(products.data || products.ranking).slice(0, 10).map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-white/30 w-4">{i + 1}.</span>
                      <span className="text-[11px] text-white/70 flex-1 truncate">{p.product || p.name}</span>
                      <span className="text-[10px] font-mono text-cyan-400">{p.queries || p.query_count || p.count}</span>
                    </div>
                  ))}
                </div>
              ) : <Waiting label="Waiting for /products/ranking API" />}
            </Panel>

            {/* Error / Fallback Analysis */}
            <Panel title="Unanswered / Fallback">
              {errors ? (
                <div>
                  {(errors.negativeFeedback?.length > 0 || errors.unclassified?.length > 0) ? (
                    <div className="flex flex-col gap-1.5">
                      {[...(errors.negativeFeedback || []), ...(errors.unclassified || [])].slice(0, 8).map((e: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-[10px] text-red-400 shrink-0 mt-0.5">!</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-white/60 truncate">{e.question || e.user_message || e.message}</div>
                            <div className="text-[9px] text-white/25 font-mono">{e.reason || e.type || "unclassified"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-[10px] text-white/15 font-mono">No errors or unanswered queries detected</div>}
                </div>
              ) : <Waiting label="Waiting for /errors API" />}
            </Panel>
          </div>

          {/* Row 3: KB Coverage + Link Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* KB Coverage Map */}
            <Panel title="KB Coverage">
              {kbStats?.source_breakdown?.length ? (
                <div className="flex flex-col gap-1.5">
                  {kbStats.source_breakdown.map((s: any) => {
                    const pct = kbStats.total_chunks > 0 ? Math.round((s.chunks / kbStats.total_chunks) * 100) : 0;
                    return (
                      <div key={s.source} className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-white/50 w-24 sm:w-28 truncate">{s.source}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                          <div className="h-full rounded-full bg-purple-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-white/40 w-16 text-right">{s.chunks} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <MiniStat label="Chunks" value={kbStats?.total_chunks?.toLocaleString() ?? "—"} />
                  <MiniStat label="Files" value={kbStats?.total_files ?? "—"} />
                  <MiniStat label="Links" value={kbStats?.total_links ?? "—"} />
                  <MiniStat label="Embeddings" value={kbStats?.embed_coverage_pct ? `${kbStats.embed_coverage_pct}%` : "—"} />
                  <MiniStat label="Avg Tokens" value={kbStats?.avg_tokens_per_chunk ?? "—"} />
                  <MiniStat label="Corrections" value={kbStats?.corrections ?? "—"} />
                </div>
              )}
            </Panel>

            {/* Link Injection Stats */}
            <Panel title="Link Injection Stats">
              {links ? (
                <div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <MiniStat label="Responses" value={links.totalResponses ?? "—"} />
                    <MiniStat label="With Links" value={links.responsesWithLinks ?? 0} />
                    <MiniStat label="Link Rate" value={links.linkRate != null ? `${Math.round(links.linkRate * 100)}%` : "0%"} />
                  </div>
                  {links.topUrls?.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {links.topUrls.slice(0, 8).map((l: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-white/30 w-4">{i + 1}.</span>
                          <span className="text-[10px] text-white/50 flex-1 truncate font-mono">{l.url}</span>
                          <span className="text-[10px] font-mono text-cyan-400">{l.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-[10px] text-white/15 font-mono">No links injected yet — bot will start adding URLs soon</div>}
                </div>
              ) : <Waiting label="Waiting for /links/stats API" />}
            </Panel>
          </div>

          {/* Row 4: Time Patterns + Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Peak Hours */}
            <Panel title={`Peak Hours${patterns?.peakHour != null ? ` — busiest: ${patterns.peakHour}:00` : ""}`}>
              {(patterns?.hourDistribution?.length || patterns?.hourly?.length) ? (
                <div className="flex items-end gap-[2px] h-20">
                  {(patterns.hourDistribution || patterns.hourly).map((h: any, i: number) => {
                    const arr = patterns.hourDistribution || patterns.hourly;
                    const max = Math.max(...arr.map((x: any) => x.count || x.queries || 0));
                    const val = h.count || h.queries || 0;
                    const pct = max > 0 ? (val / max) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${h.hour ?? i}:00 — ${val} queries`}>
                        <div className="w-full rounded-t" style={{ height: `${Math.max(2, pct)}%`, background: pct > 70 ? "#22d3ee" : pct > 30 ? "#a78bfa" : "#333" }} />
                        {i % 4 === 0 && <span className="text-[7px] text-white/20">{(h.hour ?? i)}h</span>}
                      </div>
                    );
                  })}
                </div>
              ) : <Waiting label="Waiting for /patterns API" />}
            </Panel>

            {/* Comparison */}
            <Panel title="Today vs Yesterday">
              {analytics?.comparison ? (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Today" value={analytics.comparison.today ?? "—"} />
                  <MiniStat label="Yesterday" value={analytics.comparison.yesterday ?? "—"} />
                  <MiniStat label="Last Week" value={analytics.comparison.last_week ?? "—"} />
                  <MiniStat label="Change" value={analytics.comparison.change ? `${analytics.comparison.change > 0 ? "+" : ""}${analytics.comparison.change}%` : "—"} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Total" value={stats?.total_sessions ?? "—"} />
                  <MiniStat label="Today" value={stats?.messages_today ?? "—"} />
                  <MiniStat label="Users Today" value={stats?.active_users_today ?? "—"} />
                  <MiniStat label="All Users" value={stats?.total_unique_users ?? "—"} />
                </div>
              )}
            </Panel>
          </div>

          {/* KB Health footer */}
          {kbStats?.last_update && (
            <div className="text-[9px] text-white/15 font-mono text-right px-1">
              KB updated: {new Date(kbStats.last_update).toLocaleString("th-TH")} · Embed coverage: {kbStats.embed_coverage_pct ?? "?"}%
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════
           ePOS TAB
         ═══════════════════════════════════ */}
      {tab === "epos" && (
        <div className="flex-1 flex flex-col gap-3" style={{ minHeight: 300 }}>
          <Panel title="ePOS Pipeline Status">
            <div className="text-xs text-white/40 font-mono">
              ePOS data integration in progress — waiting for AIA-Oracle portal scrape API.
              <br />Endpoints: /epos/status, /epos/alerts, /epos/followups
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
});

// ─── Sub-components ──────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] p-3 sm:p-4" style={{ background: "#0a0a12" }}>
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2.5">{title}</div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] px-3 py-2 sm:px-4 sm:py-3" style={{ background: "#0a0a12" }}>
      <div className="text-lg sm:text-2xl font-bold font-mono" style={{ color }}>{value}</div>
      <div className="text-[8px] sm:text-[10px] uppercase tracking-wider text-white/30 mt-0.5">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-base sm:text-lg font-bold font-mono text-white/70">{value}</div>
      <div className="text-[8px] sm:text-[9px] text-white/30 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function Waiting({ label }: { label?: string }) {
  return <div className="text-[11px] text-white/15 font-mono">{label || "Waiting for API..."}</div>;
}

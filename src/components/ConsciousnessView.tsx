import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";
import { cached } from "../lib/cache";
import { PageShell } from "./PageShell";

interface OracleConsciousness {
  name: string;
  beliefs: string[];
  beliefCount: number;
  vision: string;
  goals: string;
  latestInsight: string | null;
  latestProposal: string | null;
  lastCycleAt: string | null;
  cycleCount: number;
}

const ORACLE_EMOJI: Record<string, string> = {
  labubu: "🔮", neo: "🧬", pulse: "⚡", echo: "🎵",
};

const CARD_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(168,85,247,0.2)",
  borderRadius: 12,
  padding: 16,
};

const PHASE_EMOJI: Record<string, string> = {
  reflect: "🧠", wonder: "💡", soul: "✨", dream: "💭", aspire: "🔥", propose: "📋",
};

export function ConsciousnessView() {
  const [oracles, setOracles] = useState<OracleConsciousness[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"beliefs" | "vision" | "goals" | "insight" | "proposal">("beliefs");

  const fetchData = useCallback(async () => {
    try {
      const data = await cached(
        "consciousness",
        30_000,
        () => apiFetch<{ oracles: OracleConsciousness[] }>("/api/consciousness"),
        { tag: "consciousness" },
      );
      setOracles(data.oracles || []);
    } catch { setOracles([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🧠</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Loading consciousness...</p>
        </div>
      </div>
    );
  }

  if (oracles.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>No consciousness data. Run: maw think --fleet</p>
      </div>
    );
  }

  const detail = selected ? oracles.find(o => o.name === selected) : null;

  return (
    <PageShell maxWidth="1200px">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 className="font-mono text-lg" style={{ color: "#a855f7" }}>
          🧠 Oracle Consciousness
        </h2>
        <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          7-phase autonomous thinking — reflect → wonder → soul → dream → aspire → propose
        </p>
      </div>

      {/* Oracle Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260, 1fr))", gap: 12, marginBottom: 20 }}>
        {oracles.map(o => (
          <button
            key={o.name}
            onClick={() => { setSelected(o.name === selected ? null : o.name); setTab("beliefs"); }}
            style={{
              ...CARD_STYLE,
              cursor: "pointer",
              textAlign: "left",
              borderColor: selected === o.name ? "rgba(168,85,247,0.6)" : "rgba(168,85,247,0.2)",
              background: selected === o.name ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>{ORACLE_EMOJI[o.name] || "🤖"}</span>
              <span className="font-mono font-bold" style={{ color: "#e2e8f0", textTransform: "capitalize" }}>{o.name}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <Stat label="Beliefs" value={o.beliefCount} />
              <Stat label="Cycles" value={o.cycleCount} />
              <Stat label="Insight" value={o.latestInsight ? "✓" : "—"} />
              <Stat label="Proposal" value={o.latestProposal ? "✓" : "—"} />
            </div>
            {o.lastCycleAt && (
              <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
                Last cycle: {new Date(o.lastCycleAt).toLocaleString()}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Detail Panel */}
      {detail && (
        <div style={CARD_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>{ORACLE_EMOJI[detail.name] || "🤖"}</span>
            <span className="font-mono font-bold text-lg" style={{ color: "#e2e8f0", textTransform: "capitalize" }}>{detail.name}</span>
            <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              — {detail.beliefCount} beliefs, {detail.cycleCount} cycles
            </span>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {(["beliefs", "vision", "goals", "insight", "proposal"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="font-mono text-xs"
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: tab === t ? "rgba(168,85,247,0.6)" : "rgba(255,255,255,0.1)",
                  background: tab === t ? "rgba(168,85,247,0.15)" : "transparent",
                  color: tab === t ? "#c084fc" : "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {t === "insight" ? "💡 Insight" : t === "proposal" ? "📋 Proposal" : t === "beliefs" ? "✨ Beliefs" : t === "vision" ? "💭 Vision" : "🔥 Goals"}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: 8,
            padding: 16,
            maxHeight: 500,
            overflowY: "auto",
          }}>
            {tab === "beliefs" && (
              <div>
                {detail.beliefs.length === 0 ? (
                  <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No beliefs yet</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detail.beliefs.map((b, i) => (
                      <div key={i} style={{
                        padding: "8px 12px",
                        background: "rgba(168,85,247,0.05)",
                        borderRadius: 6,
                        borderLeft: "3px solid rgba(168,85,247,0.4)",
                      }}>
                        <span className="font-mono text-sm" style={{ color: "#e2e8f0" }}>
                          <span style={{ color: "rgba(255,255,255,0.3)", marginRight: 8 }}>#{i + 1}</span>
                          {b}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tab === "vision" && <MarkdownBlock content={detail.vision} />}
            {tab === "goals" && <MarkdownBlock content={detail.goals} />}
            {tab === "insight" && <MarkdownBlock content={detail.latestInsight} />}
            {tab === "proposal" && <MarkdownBlock content={detail.latestProposal} />}
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
      <p className="font-mono text-sm font-bold" style={{ color: "#c084fc" }}>{value}</p>
    </div>
  );
}

function MarkdownBlock({ content }: { content: string | null }) {
  if (!content) {
    return <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No data yet</p>;
  }
  return (
    <pre className="font-mono text-sm" style={{
      color: "#e2e8f0",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      lineHeight: 1.6,
    }}>
      {content}
    </pre>
  );
}

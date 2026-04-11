import { useState, useEffect } from "react";
import { agentColor } from "../lib/constants";
import { ChibiPortrait } from "./ChibiPortrait";

interface FrameEntry {
  oracle: string;
  name: string;
  role: string;
  badge: string;
  citation: string | null;
  tier: string;
  reason?: string;
}

const FRAME_COLORS: Record<string, { border: string; highlight: string; shadow: string; bg: string; mat: string }> = {
  fame:              { border: "rgba(255,224,102,0.5)", highlight: "#ffe066", shadow: "#997a1f", bg: "#1a1508", mat: "#2a2010" },
  hall_of_fame:      { border: "rgba(255,215,0,0.4)",  highlight: "#ffd700", shadow: "#8b6914", bg: "#1a1508", mat: "#2a2010" },
  honorable_mention: { border: "rgba(205,127,50,0.4)", highlight: "#cd7f32", shadow: "#6b4226", bg: "#1a1410", mat: "#231a14" },
  _default:          { border: "rgba(255,255,255,0.1)", highlight: "#888",   shadow: "#333",    bg: "#121212", mat: "#1a1a1a" },
};

function Frame({ entry }: { entry: FrameEntry }) {
  const fc = FRAME_COLORS[entry.tier] || FRAME_COLORS._default;

  return (
    <div className="flex flex-col items-center group" style={{ maxWidth: 170 }}>
      {/* Frame */}
      <div style={{
        padding: 8,
        background: `linear-gradient(145deg, ${fc.highlight}, ${fc.border} 40%, ${fc.shadow})`,
        borderRadius: 6,
        boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 20px ${fc.highlight}15`,
      }}>
        {/* Mat */}
        <div style={{ background: fc.mat, borderRadius: 3, padding: 6, border: `1px solid ${fc.border}` }}>
          {/* Portrait */}
          <div style={{
            background: `radial-gradient(ellipse at 50% 40%, ${fc.bg}, #080808)`,
            borderRadius: 2, width: 120, height: 130,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${fc.border}`,
            overflow: "hidden",
          }}>
            <ChibiPortrait name={entry.oracle} size={90} />
          </div>
        </div>
      </div>

      {/* Nameplate */}
      <div className="mt-2 px-3 py-1.5 text-center" style={{
        background: `linear-gradient(180deg, ${fc.highlight}30, ${fc.border}20, ${fc.shadow}30)`,
        border: `1px solid ${fc.border}`,
        borderRadius: 3, minWidth: 130,
      }}>
        <div className="text-xs font-bold" style={{ color: fc.highlight }}>{entry.name.replace("-Oracle", "").replace("Oracle", "") || entry.oracle}</div>
        <div style={{ fontSize: 9, color: `${fc.highlight}aa` }}>{entry.role}</div>
      </div>

      {/* Badge */}
      {entry.badge && (
        <div className="mt-1 px-2 py-0.5 rounded-full text-center" style={{
          fontSize: 9, fontWeight: "bold", color: fc.highlight,
          background: `${fc.highlight}12`, border: `1px solid ${fc.highlight}25`,
        }}>
          {entry.badge}
        </div>
      )}

      {/* Citation on hover */}
      {entry.citation && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 px-2 py-1 rounded text-center" style={{
          maxWidth: 160, background: "rgba(0,0,0,0.85)", border: `1px solid ${fc.border}`,
          fontSize: 8, color: "rgba(255,255,255,0.5)", fontStyle: "italic",
        }}>
          "{entry.citation}"
        </div>
      )}
    </div>
  );
}

function Section({ title, color, entries, wallBg }: { title: string; color: string; entries: FrameEntry[]; wallBg?: string }) {
  if (entries.length === 0) return null;
  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-6 justify-center">
        <div className="h-px flex-1 max-w-20" style={{ background: `linear-gradient(90deg, transparent, ${color}40)` }} />
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color, letterSpacing: 6 }}>{title}</h3>
        <div className="h-px flex-1 max-w-20" style={{ background: `linear-gradient(270deg, transparent, ${color}40)` }} />
      </div>
      <div className="rounded-xl p-6 sm:p-8" style={{
        background: wallBg || "linear-gradient(180deg, #12100a, #0c0a06 50%, #080604)",
        border: `1px solid ${color}15`,
        boxShadow: "inset 0 0 80px rgba(0,0,0,0.5)",
      }}>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
          {entries.map((e) => <Frame key={e.oracle} entry={e} />)}
        </div>
      </div>
    </div>
  );
}

export function HallOfFameView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/hall-of-fame")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) return <div className="p-20 text-center text-white/40">Loading Hall of Fame...</div>;
  if (error) return <div className="p-20 text-center text-red-400">Error: {error}</div>;
  if (!data) return <div className="p-20 text-center text-white/40">No data</div>;

  // Normalize: support both HR v2 format and legacy format
  const meta = data.meta || {};
  let fame: FrameEntry[] = [];
  let hof: FrameEntry[] = [];
  let hon: FrameEntry[] = [];
  let rest: FrameEntry[] = [];

  try {
    if (data.fame) {
      // HR v2 format
      const f = data.fame;
      fame = [{
        oracle: f.oracle || "unknown", name: f.name || f.oracle || "", role: f.role || "",
        badge: f.badge || "", citation: f.citation || null, tier: "fame",
      }];
      hof = (data.hall_of_fame || []).map((i: any) => ({
        oracle: i.oracle || "", name: i.name || i.oracle || "", role: i.role || "",
        badge: i.badge || "", citation: i.citation || null, tier: "hall_of_fame",
      }));
      hon = (data.honorable_mention || []).map((i: any) => ({
        oracle: i.oracle || "", name: i.name || i.oracle || "", role: i.role || "",
        badge: i.badge || "", citation: i.citation || null, tier: "honorable_mention",
      }));
      rest = (data.not_inducted || []).map((i: any) => ({
        oracle: i.oracle || "", name: i.name || i.oracle || "", role: "",
        badge: "", citation: null, tier: "not_inducted", reason: i.reason || "",
      }));
    } else if (data.inductees) {
      // Legacy format
      fame = data.inductees.filter((i: any) => i.tier === "eternal").map((i: any) => ({
        oracle: i.oracle, name: i.name || i.oracle, role: i.role || "",
        badge: i.primary_badge || "", citation: i.citation || null, tier: "hall_of_fame",
      }));
      hon = data.inductees.filter((i: any) => i.tier === "weekly").map((i: any) => ({
        oracle: i.oracle, name: i.name || i.oracle, role: i.role || "",
        badge: i.primary_badge || "", citation: i.citation || null, tier: "honorable_mention",
      }));
      rest = data.inductees.filter((i: any) => !i.tier).map((i: any) => ({
        oracle: i.oracle, name: i.name || i.oracle, role: "",
        badge: "", citation: null, tier: "not_inducted",
      }));
    }
  } catch (e: any) {
    return <div className="p-20 text-center text-red-400">Data parse error: {e.message}</div>;
  }

  return (
    <div className="px-3 sm:px-6 md:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-block px-8 py-3 rounded-lg" style={{
          background: "linear-gradient(180deg, #2a2010, #1a1508, #0a0804)",
          border: "2px solid #c9a84c50",
          boxShadow: "0 4px 30px rgba(201,168,76,0.1)",
        }}>
          <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: "#ffd700", letterSpacing: 4, textShadow: "0 0 20px #ffd70030" }}>
            HALL OF FAME
          </h2>
          <p className="text-xs mt-1" style={{ color: "#c9a84c90", letterSpacing: 4 }}>BOB'S OFFICE</p>
          <div className="flex items-center justify-center gap-4 mt-2 text-xs" style={{ color: "#c9a84c70" }}>
            <span>{meta.week_label || "Week 1"}</span>
            <span>|</span>
            <span>{meta.total_commits_week || 0} commits</span>
            <span>|</span>
            <span>{meta.team_size || 0} oracles</span>
          </div>
        </div>
      </div>

      <Section title="Fame" color="#ffe066" entries={fame} wallBg="radial-gradient(ellipse at 50% 30%, #1a1508, #0c0a06 60%, #080604)" />
      <Section title="Hall of Fame" color="#ffd700" entries={hof} />
      <Section title="Honorable Mention" color="#cd7f32" entries={hon} />

      {/* Not Inducted — small silhouettes */}
      {rest.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4 justify-center">
            <div className="h-px flex-1 max-w-16 bg-white/10" />
            <h3 className="text-xs font-bold uppercase text-white/20" style={{ letterSpacing: 4 }}>Not Inducted</h3>
            <div className="h-px flex-1 max-w-16 bg-white/10" />
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {rest.map((e) => (
              <div key={e.oracle} className="flex flex-col items-center opacity-40 group" style={{ maxWidth: 80 }}>
                <div className="rounded p-1" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                  <ChibiPortrait name={e.oracle} size={50} />
                </div>
                <span className="text-white/30 mt-1" style={{ fontSize: 9 }}>{e.oracle}</span>
                {e.reason && <span className="text-white/15 text-center mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: 7 }}>{e.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8">
        <span style={{ fontSize: 9, color: "#c9a84c50" }}>
          Updated {meta.last_updated || "?"} by {meta.updated_by || "?"}
        </span>
      </div>
    </div>
  );
}

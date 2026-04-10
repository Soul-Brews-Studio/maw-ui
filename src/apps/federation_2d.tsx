import { createRoot } from "react-dom/client";
import "../index.css";
import { useFederationData } from "../hooks/useFederationData";
import { useFederationStore } from "../components/federation/store";
import { Canvas2D } from "../components/federation/Canvas2D";
import { Sidebar } from "../components/federation/Sidebar";
import { simulate, layoutCircle } from "../components/federation/simulation";
import { machineColor } from "../components/federation/colors";

const LAYOUTS = ["force", "circle"] as const;

function App() {
  const { connected, mqttConnected } = useFederationData();
  const store = useFederationStore();
  const { machines, agents, edges, version, plugins, showLineage, toggleLineage, layout, setLayout, setGraph, particles, showHistoryEdges } = store;

  const reformat = () => {
    const nextIdx = (LAYOUTS.indexOf(layout as any) + 1) % LAYOUTS.length;
    const next = LAYOUTS[nextIdx];
    const W = (window.innerWidth - 240) || 900;
    const H = (window.innerHeight - 52) || 600;
    const a = [...agents];
    if (next === "circle") layoutCircle(a, W, H);
    else simulate(a, edges, W, H);
    setLayout(next);
    setGraph(a, edges, particles);
  };

  const totalAgents = agents.length;
  const msgCount = edges.filter(e => e.type === "message").reduce((s, e) => s + e.count, 0);
  const syncCount = edges.filter(e => e.type === "sync").length;
  const lineageCount = edges.filter(e => e.type === "lineage").length;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#020a18" }}>
      <header className="flex items-center gap-4 px-6 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{"\uD83D\uDD78"}</span>
          <h1 className="text-lg font-black tracking-tight" style={{ color: "#00f5d4" }}>Federation Mesh</h1>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          {connected ? "WS" : "OFFLINE"}
        </span>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${mqttConnected ? "bg-purple-500/15 text-purple-400" : "bg-white/5 text-white/20"}`}>
          {mqttConnected ? "MQTT" : "MQTT OFF"}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/20">
          <span>{machines.length} machines</span>
          <span>&middot;</span>
          <span>{totalAgents} agents</span>
          <span>&middot;</span>
          <button onClick={() => store.setState({ showHistoryEdges: !showHistoryEdges })} className={`cursor-pointer hover:text-cyan-400/60 ${showHistoryEdges ? "text-white/20" : "text-white/15 line-through"}`}>{msgCount} msg</button>
          <span>&middot;</span>
          <span>{syncCount} sync</span>
          <span>&middot;</span>
          <button onClick={toggleLineage} className={`cursor-pointer hover:text-cyan-400/60 ${showLineage ? "text-cyan-400/40" : "text-white/15 line-through"}`}>{lineageCount} lineage</button>
          {plugins.length > 0 && <><span>&middot;</span><span className="text-purple-400/40">{plugins.length} plugins</span></>}
          {version && <><span>&middot;</span><span>v{version}</span></>}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {machines.map(m => (
            <span key={m} className="flex items-center gap-1 text-[9px] font-mono" style={{ color: machineColor(m) }}>
              <span className="w-2 h-2 rounded-full" style={{ background: machineColor(m) }} />{m}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <Canvas2D />
        <div className="absolute bottom-4 left-4 flex gap-2">
          <button onClick={reformat}
            className="px-3 py-2 rounded-lg border text-[10px] font-mono cursor-pointer hover:bg-white/[0.05] transition-colors"
            style={{ background: "rgba(3,10,24,0.9)", borderColor: "rgba(255,255,255,0.08)", color: "rgba(0,245,212,0.5)" }}>
            {layout === "force" ? "\u26A1" : "\u2B55"} {layout}
          </button>
        </div>
        <Sidebar />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

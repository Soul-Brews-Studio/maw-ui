import { createRoot } from "react-dom/client";
import "../index.css";
import { useFederationData } from "../hooks/useFederationData";
import { useFederationStore } from "../components/federation/store";
import { Canvas2D } from "../components/federation/Canvas2D";
import { Sidebar } from "../components/federation/Sidebar";
import { machineColor } from "../components/federation/colors";

function App() {
  const { connected } = useFederationData();
  const { machines, agents, edges, version } = useFederationStore();

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
          {connected ? "LIVE" : "OFFLINE"}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/20">
          <span>{machines.length} machines</span>
          <span>&middot;</span>
          <span>{totalAgents} agents</span>
          <span>&middot;</span>
          <span>{msgCount} msg</span>
          <span>&middot;</span>
          <span>{syncCount} sync</span>
          <span>&middot;</span>
          <span className="text-cyan-400/40">{lineageCount} lineage</span>
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

      <div className="flex flex-1 overflow-hidden">
        <Canvas2D />
        <Sidebar />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

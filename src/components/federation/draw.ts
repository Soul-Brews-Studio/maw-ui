import type { AgentNode, AgentEdge, Particle } from "./types";
import { machineColor, statusGlow, hexRgb } from "./colors";

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: { x: number; y: number; zoom: number },
  W: number, H: number, time: number,
) {
  const gridStep = 40;
  const gx0 = Math.floor(-cam.x / cam.zoom / gridStep) * gridStep;
  const gy0 = Math.floor(-cam.y / cam.zoom / gridStep) * gridStep;
  const gx1 = gx0 + W / cam.zoom + gridStep;
  const gy1 = gy0 + H / cam.zoom + gridStep;
  for (let x = gx0; x < gx1; x += gridStep) {
    for (let y = gy0; y < gy1; y += gridStep) {
      const p = Math.sin(time * 0.0008 + x * 0.01 + y * 0.01) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.02 * p})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawClusterLabels(ctx: CanvasRenderingContext2D, agents: AgentNode[]) {
  const clusters: Record<string, { x: number; y: number; count: number }> = {};
  for (const a of agents) {
    const cp = clusters[a.node] || { x: 0, y: 0, count: 0 };
    cp.x += a.x; cp.y += a.y; cp.count++;
    clusters[a.node] = cp;
  }
  for (const [name, cp] of Object.entries(clusters)) {
    const mx = cp.x / cp.count, my = cp.y / cp.count;
    const color = machineColor(name);
    const [r, g, b] = hexRgb(color);
    const grad = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.08)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = `rgba(${r},${g},${b},0.45)`;
    ctx.textAlign = "center";
    ctx.fillText(name, mx, my + 70);
  }
}

export function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: AgentEdge[],
  byId: Map<string, AgentNode>,
  sel: string | null,
  hov: string | null,
  particles: Map<string, Particle[]>,
  time: number,
  edgePulses?: Record<string, number>,
  showLineage?: boolean,
  showHistoryEdges?: boolean,
) {
  for (const edge of edges) {
    const a = byId.get(edge.source), b = byId.get(edge.target);
    if (!a || !b) continue;
    if (edge.type === "lineage" && !showLineage) continue;
    // Hide sync edges when history edges are hidden
    if (edge.type === "sync" && showHistoryEdges === false) continue;
    // Hide historical message edges unless they have an active pulse
    if (edge.type === "message" && showHistoryEdges === false) {
      const ek = [edge.source, edge.target].sort().join("-");
      if (!edgePulses?.[ek] || (Date.now() - edgePulses[ek]) > 3000) continue;
    }

    const isHighlighted = sel === a.id || sel === b.id || hov === a.id || hov === b.id;
    const dimmed = sel && !isHighlighted;

    if (edge.type === "lineage") {
      ctx.save();
      ctx.strokeStyle = `rgba(0,245,212,${dimmed ? 0.06 : 0.35})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -time * 0.015;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    } else if (edge.type === "sync") {
      const mc = machineColor(a.node);
      const [r, g, bb] = hexRgb(mc);
      ctx.strokeStyle = `rgba(${r},${g},${bb},${dimmed ? 0.05 : isHighlighted ? 0.5 : 0.15})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (edge.type === "message") {
      // Check if this edge has a live pulse
      const edgeKey = [edge.source, edge.target].sort().join("-");
      const pulseTs = edgePulses?.[edgeKey];
      const pulseAge = pulseTs ? Date.now() - pulseTs : Infinity;
      const isPulsing = pulseAge < 3000;
      const pulseI = isPulsing ? Math.max(0, 1 - pulseAge / 3000) : 0;

      const opacity = dimmed ? 0.06 : isPulsing ? 0.7 + pulseI * 0.3 : isHighlighted ? 0.7 : 0.35;
      const width = Math.max(1, Math.min(3, edge.count * 0.5)) + pulseI * 3;
      ctx.save();
      ctx.shadowColor = isPulsing ? "#00ffcc" : "#00f5d4";
      ctx.shadowBlur = isPulsing ? 15 + pulseI * 20 : isHighlighted ? 8 : 3;
      ctx.strokeStyle = `rgba(0,245,212,${opacity})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();

      // Draw a traveling pulse particle on live message
      if (isPulsing) {
        const phase = (1 - pulseI); // 0→1 over 3 seconds
        const px = a.x + (b.x - a.x) * phase;
        const py = a.y + (b.y - a.y) * phase;
        ctx.save();
        ctx.shadowColor = "#00ffcc";
        ctx.shadowBlur = 20;
        ctx.fillStyle = `rgba(0,255,204,${0.5 + pulseI * 0.5})`;
        ctx.beginPath();
        ctx.arc(px, py, 3 + pulseI * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Particles — only on edges with active pulse or sync when highlighted
    const edgeKey = edge.type === "message" ? [edge.source, edge.target].sort().join("-") : "";
    const hasActivePulse = edgeKey && edgePulses?.[edgeKey] && (Date.now() - edgePulses[edgeKey]) < 3000;
    if ((edge.type === "message" && hasActivePulse) || (edge.type === "sync" && isHighlighted)) {
      const key = `${edge.source}-${edge.target}`;
      const pts = particles.get(key);
      if (pts) {
        for (const p of pts) {
          p.phase = (p.phase + p.speed * 16) % 1;
          const px = a.x + (b.x - a.x) * p.phase;
          const py = a.y + (b.y - a.y) * p.phase;
          const color = edge.type === "message" ? "#00f5d4" : machineColor(a.node);
          const [r, g, bb] = hexRgb(color);
          const pOpacity = dimmed ? 0.05 : (0.4 + Math.sin(p.phase * Math.PI) * 0.4);
          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 5;
          ctx.fillStyle = `rgba(${r},${g},${bb},${pOpacity})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }
}

export function drawAgents(
  ctx: CanvasRenderingContext2D,
  agents: AgentNode[],
  edges: AgentEdge[],
  statuses: Record<string, string>,
  sel: string | null,
  hov: string | null,
  fl: Record<string, number>,
  time: number,
) {
  for (const agent of agents) {
    const color = machineColor(agent.node);
    const [r, g, b] = hexRgb(color);
    const status = statuses[agent.id] || "idle";
    const sc = statusGlow(status);
    const [sr, sg, sb] = hexRgb(sc);
    const isSel = sel === agent.id;
    const isHov = hov === agent.id;
    const isConnected = sel && edges.some(e =>
      (e.source === sel && e.target === agent.id) || (e.target === sel && e.source === agent.id));
    const dimmed = sel && !isSel && !isConnected;

    const flashAge = fl[agent.id] ? Date.now() - fl[agent.id] : Infinity;
    const isFlashing = flashAge < 3000;
    const flashI = isFlashing ? Math.max(0, 1 - flashAge / 3000) : 0;

    const baseR = isSel ? 12 : isHov ? 11 : 9;
    const pulse = status === "busy" ? Math.sin(time * 0.005) * 2 : 0;
    const dotR = baseR + pulse + flashI * 6;

    ctx.save();
    if (status === "busy" || isFlashing) {
      ctx.shadowColor = sc;
      ctx.shadowBlur = 15 + flashI * 20;
    } else if (isSel || isHov) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    const grad = ctx.createRadialGradient(agent.x, agent.y, 0, agent.x, agent.y, dotR);
    if (status === "busy") {
      grad.addColorStop(0, `rgba(${sr},${sg},${sb},${dimmed ? 0.2 : 0.9})`);
      grad.addColorStop(1, `rgba(${sr},${sg},${sb},${dimmed ? 0.06 : 0.3})`);
    } else {
      grad.addColorStop(0, `rgba(${r},${g},${b},${dimmed ? 0.12 : 0.8})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${dimmed ? 0.03 : 0.2})`);
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(agent.x, agent.y, dotR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = status === "busy"
      ? `rgba(${sr},${sg},${sb},${dimmed ? 0.2 : 0.9})`
      : `rgba(${r},${g},${b},${dimmed ? 0.1 : isSel ? 1.0 : 0.6})`;
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    if (status === "busy" && !dimmed) {
      const ringR = dotR + 4 + Math.sin(time * 0.003) * 1.5;
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},0.15)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = `${isSel ? "bold " : ""}8px monospace`;
    ctx.fillStyle = `rgba(255,255,255,${dimmed ? 0.1 : isSel ? 0.9 : isHov ? 0.7 : 0.5})`;
    ctx.textAlign = "center";
    ctx.fillText(agent.id, agent.x, agent.y + dotR + 12);
  }
}

export function drawLegend(ctx: CanvasRenderingContext2D, agents: AgentNode[], H: number) {
  const ly = H - 25;
  ctx.font = "8px monospace";
  ctx.textAlign = "left";

  let lx = 20;
  for (const m of [...new Set(agents.map(a => a.node))]) {
    const c = machineColor(m);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(m, lx + 8, ly + 3);
    lx += ctx.measureText(m).width + 22;
  }

  lx += 10;
  ctx.strokeStyle = "rgba(0,245,212,0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 15, ly); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("message", lx + 20, ly + 3);
  lx += 70;

  ctx.save();
  ctx.strokeStyle = "rgba(0,245,212,0.3)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 15, ly); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillText("lineage", lx + 20, ly + 3);
}

import type { AgentNode, AgentEdge } from "./types";

export type LayoutMode = "force" | "circle" | "grid" | "tree";

export function layoutCircle(agents: AgentNode[], W: number, H: number) {
  const cx = W * 0.48, cy = H * 0.5;
  const machines = [...new Set(agents.map(a => a.node))];
  const r = Math.min(W, H) * 0.38;
  let idx = 0;
  for (const m of machines) {
    const group = agents.filter(a => a.node === m);
    for (const a of group) {
      const angle = (idx / agents.length) * Math.PI * 2 - Math.PI / 2;
      a.x = cx + Math.cos(angle) * r;
      a.y = cy + Math.sin(angle) * r;
      a.vx = 0; a.vy = 0;
      idx++;
    }
  }
}

export function layoutGrid(agents: AgentNode[], W: number, H: number) {
  const machines = [...new Set(agents.map(a => a.node))];
  const cols = Math.ceil(Math.sqrt(agents.length));
  const cellW = (W - 100) / cols;
  const cellH = (H - 100) / Math.ceil(agents.length / cols);
  let idx = 0;
  for (const m of machines) {
    const group = agents.filter(a => a.node === m);
    for (const a of group) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      a.x = 50 + col * cellW + cellW / 2;
      a.y = 50 + row * cellH + cellH / 2;
      a.vx = 0; a.vy = 0;
      idx++;
    }
  }
}

export function layoutTree(agents: AgentNode[], edges: AgentEdge[], W: number, H: number) {
  const machines = [...new Set(agents.map(a => a.node))];
  const machineW = (W - 60) / machines.length;

  for (let mi = 0; mi < machines.length; mi++) {
    const group = agents.filter(a => a.node === machines[mi]);
    const x = 30 + mi * machineW + machineW / 2;
    // Find root (no buddedFrom in this group)
    const roots = group.filter(a => !a.buddedFrom || !group.some(g => g.id === a.buddedFrom));
    const others = group.filter(a => !roots.includes(a));
    const all = [...roots, ...others];
    const rowH = (H - 100) / Math.max(all.length, 1);
    all.forEach((a, i) => {
      a.x = x + (i % 2 === 0 ? -20 : 20);
      a.y = 50 + i * rowH + rowH / 2;
      a.vx = 0; a.vy = 0;
    });
  }
}

export function simulate(agents: AgentNode[], edges: AgentEdge[], W: number, H: number) {
  const cx = W * 0.48, cy = H * 0.5;

  // Machine cluster centers (arranged in a ring)
  const machines = [...new Set(agents.map(a => a.node))];
  const clusterR = Math.min(W, H) * 0.32;
  const clusterCenters: Record<string, { x: number; y: number }> = {};
  machines.forEach((m, i) => {
    const angle = (i / machines.length) * Math.PI * 2 - Math.PI / 2;
    clusterCenters[m] = { x: cx + Math.cos(angle) * clusterR, y: cy + Math.sin(angle) * clusterR };
  });

  // Initialize positions near cluster center
  for (const a of agents) {
    const cc = clusterCenters[a.node] || { x: cx, y: cy };
    a.x = cc.x + (Math.random() - 0.5) * 140;
    a.y = cc.y + (Math.random() - 0.5) * 140;
    a.vx = 0;
    a.vy = 0;
  }

  const byId = new Map(agents.map(a => [a.id, a]));

  // Run simulation steps
  for (let iter = 0; iter < 200; iter++) {
    const alpha = 0.3 * (1 - iter / 200);

    // Repulsion between all agents
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i], b = agents[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = a.node === b.node ? 75 : 120;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * alpha * 0.5;
          dx *= force; dy *= force;
          a.vx -= dx; a.vy -= dy;
          b.vx += dx; b.vy += dy;
        }
      }
    }

    // Attraction to cluster center
    for (const a of agents) {
      const cc = clusterCenters[a.node];
      if (!cc) continue;
      const dx = cc.x - a.x, dy = cc.y - a.y;
      a.vx += dx * alpha * 0.015;
      a.vy += dy * alpha * 0.015;
    }

    // Edge attraction (sync peers pull toward each other gently)
    for (const edge of edges) {
      if (edge.type !== "sync") continue;
      const a = byId.get(edge.source), b = byId.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > 120) {
        const force = (dist - 120) / dist * alpha * 0.02;
        a.vx += dx * force;
        a.vy += dy * force;
        b.vx -= dx * force;
        b.vy -= dy * force;
      }
    }

    // Apply velocity with damping
    for (const a of agents) {
      a.x += a.vx;
      a.y += a.vy;
      a.vx *= 0.7;
      a.vy *= 0.7;
      // Bounds
      a.x = Math.max(40, Math.min(W - 40, a.x));
      a.y = Math.max(40, Math.min(H - 40, a.y));
    }
  }
}

import { useRef, useEffect, useCallback } from "react";
import { useFederationStore } from "./store";
import { drawGrid, drawClusterLabels, drawEdges, drawAgents, drawLegend } from "./draw";

export function Canvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; camX: number; camY: number } | null>(null);

  // Subscribe to store via refs for the animation loop (avoids re-renders)
  const storeRef = useRef(useFederationStore.getState());
  useEffect(() => useFederationStore.subscribe(s => { storeRef.current = s; }), []);

  // Canvas draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let animId: number;
    let time = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    function draw() {
      time += 16;
      const W = canvas!.getBoundingClientRect().width;
      const H = canvas!.getBoundingClientRect().height;
      const { agents, edges, statuses, selected: sel, hovered: hov, flashes: fl, particles } = storeRef.current;
      const cam = camRef.current;

      // Background
      const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      bg.addColorStop(0, "#061525");
      bg.addColorStop(1, "#020a18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.zoom, cam.zoom);

      drawGrid(ctx, cam, W, H, time);
      drawClusterLabels(ctx, agents);

      const byId = new Map(agents.map(a => [a.id, a]));
      drawEdges(ctx, edges, byId, sel, hov, particles, time);
      drawAgents(ctx, agents, edges, statuses, sel, hov, fl, time);

      ctx.restore();
      drawLegend(ctx, agents, H);

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  // Interaction helpers
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = camRef.current;
    return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
  }, []);

  const hitTest = useCallback((sx: number, sy: number): string | null => {
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    for (const a of storeRef.current.agents) {
      const dx = wx - a.x, dy = wy - a.y;
      if (dx * dx + dy * dy < (15 / camRef.current.zoom) ** 2) return a.id;
    }
    return null;
  }, [screenToWorld]);

  const handleDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const hit = hitTest(sx, sy);
    if (hit) {
      dragRef.current = { id: hit, startX: sx, startY: sy, moved: false };
    } else {
      const cam = camRef.current;
      panRef.current = { startX: sx, startY: sy, camX: cam.x, camY: cam.y };
    }
  }, [hitTest]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (dragRef.current) {
      const d = dragRef.current;
      if (Math.abs(sx - d.startX) > 3 || Math.abs(sy - d.startY) > 3) d.moved = true;
      if (d.moved) {
        const { x: wx, y: wy } = screenToWorld(sx, sy);
        const agent = storeRef.current.agents.find(a => a.id === d.id);
        if (agent) { agent.x = wx; agent.y = wy; }
        canvasRef.current!.style.cursor = "grabbing";
        return;
      }
    }

    if (panRef.current) {
      const p = panRef.current;
      camRef.current.x = p.camX + (sx - p.startX);
      camRef.current.y = p.camY + (sy - p.startY);
      canvasRef.current!.style.cursor = "grabbing";
      return;
    }

    const hit = hitTest(sx, sy);
    useFederationStore.getState().setHovered(hit);
    canvasRef.current!.style.cursor = hit ? "grab" : "default";
  }, [hitTest, screenToWorld]);

  const handleUp = useCallback(() => {
    const d = dragRef.current;
    if (d && !d.moved) useFederationStore.getState().setSelected(d.id);
    dragRef.current = null;
    panRef.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const cam = camRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.3, Math.min(5, cam.zoom * factor));
    cam.x = sx - (sx - cam.x) * (newZoom / cam.zoom);
    cam.y = sy - (sy - cam.y) * (newZoom / cam.zoom);
    cam.zoom = newZoom;
  }, []);

  return (
    <canvas ref={canvasRef} className="flex-1 min-w-0"
      onMouseDown={handleDown} onMouseMove={handleMove}
      onMouseUp={handleUp} onMouseLeave={handleUp}
      onWheel={handleWheel} />
  );
}

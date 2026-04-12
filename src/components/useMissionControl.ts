import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { roomStyle, PREVIEW_CARD } from "../lib/constants";
import type { AgentState, Session, AgentEvent } from "../lib/types";

interface UseMissionControlProps {
  sessions: Session[];
  agents: AgentState[];
  send: (msg: object) => void;
  onSelectAgent: (agent: AgentState) => void;
  addEvent: (target: string, type: AgentEvent["type"], detail: string) => void;
}

export function useMissionControl({ sessions, agents, send, onSelectAgent, addEvent }: UseMissionControlProps) {
  const [groupSolo, setGroupSolo] = useState(true);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ agent: AgentState; room: { label: string; accent: string }; pos: { x: number; y: number } } | null>(null);
  const [pinnedPreview, setPinnedPreview] = useState<{ agent: AgentState; room: { label: string; accent: string }; pos: { x: number; y: number }; svgX: number; svgY: number } | null>(null);
  const pinnedByUser = useRef(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();

  const [showSearch, setShowSearch] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  // Hide search when card is pinned
  useEffect(() => {
    if (pinnedPreview) setShowSearch(false);
  }, [pinnedPreview]);

  // Multi-card: track all busy agents, user can dismiss individually
  const [multiMode, setMultiMode] = useState(() => localStorage.getItem("office-multiview") !== "0");
  const [multiCards, setMultiCards] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("office-multicards");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const seenBusy = useRef<Set<string>>(new Set());

  // Persist multiCards to localStorage
  useEffect(() => {
    localStorage.setItem("office-multicards", JSON.stringify([...multiCards]));
  }, [multiCards]);

  // Listen for toggle from FloatingButtons
  const prevMultiMode = useRef(multiMode);
  useEffect(() => {
    const handler = (e: Event) => setMultiMode((e as CustomEvent).detail);
    window.addEventListener("multiview-change", handler);
    return () => window.removeEventListener("multiview-change", handler);
  }, []);
  useEffect(() => {
    const busyAgents = agents.filter(a => a.status === "busy");

    // When switching back to multi mode, re-add all busy agents
    if (multiMode && !prevMultiMode.current) {
      setPinnedPreview(null);
      const newCards = new Set(busyAgents.map(a => a.target));
      setMultiCards(prev => new Set([...prev, ...newCards]));
      for (const a of busyAgents) seenBusy.current.add(a.target);
    }
    // When switching to single mode, clear multi cards
    if (!multiMode && prevMultiMode.current) {
      setMultiCards(new Set());
    }
    prevMultiMode.current = multiMode;

    for (const a of busyAgents) {
      if (multiMode) {
        // Always ensure busy agents are in multiCards (re-adds dismissed agents)
        setMultiCards(prev => {
          if (prev.has(a.target)) return prev;
          return new Set([...prev, a.target]);
        });
      } else if (!seenBusy.current.has(a.target)) {
        const room = roomStyle(a.session);
        const pos = { x: window.innerWidth / 2 + 50, y: 80 };
        pinnedByUser.current = true;
        setPinnedPreview({ agent: a, room: { label: room.label, accent: room.accent }, pos, svgX: 600, svgY: 500 });
      }
      seenBusy.current.add(a.target);
    }
    // Clean up seen set when agents go idle
    for (const target of seenBusy.current) {
      if (!busyAgents.find(a => a.target === target)) seenBusy.current.delete(target);
    }
  }, [agents, multiMode]);

  const dismissCard = useCallback((target: string) => {
    setMultiCards(prev => { const next = new Set(prev); next.delete(target); return next; });
  }, []);

  // Cmd+K or Ctrl+K to toggle search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-fit zoom: portrait = higher zoom (narrower), landscape = 0.9
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 0.9;
    const isPortrait = window.innerHeight > window.innerWidth;
    return isPortrait ? 1.05 : 0.9;
  });
  const [pan, setPan] = useState({ x: 0, y: 120 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert SVG coordinates to screen-relative position
  const svgToScreen = useCallback((svgX: number, svgY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = svgX;
    pt.y = svgY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const screenPt = pt.matrixTransform(ctm);
    const containerRect = container.getBoundingClientRect();
    return {
      x: screenPt.x - containerRect.left,
      y: screenPt.y - containerRect.top,
    };
  }, []);

  const calcCardPos = useCallback((svgX: number, svgY: number, side: "left" | "right" | "auto" = "auto") => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };
    const screen = svgToScreen(svgX, svgY);
    const cardW = PREVIEW_CARD.width;
    const cardH = 500;
    const rightX = screen.x + 60;
    const leftX = screen.x - cardW - 40;
    let x: number;
    if (side === "right") {
      x = rightX + cardW > containerRect.width ? leftX : rightX;
    } else if (side === "left") {
      x = leftX < 0 ? rightX : leftX;
    } else {
      x = rightX + cardW > containerRect.width ? leftX : rightX;
    }
    const y = Math.max(10, Math.min(screen.y - 290, containerRect.height - cardH - 20));
    return { x, y };
  }, [svgToScreen]);

  const showPreview = useCallback((agent: AgentState, room: { label: string; accent: string }, svgX: number, svgY: number) => {
    if (pinnedPreview) return;
    clearTimeout(hoverTimeout.current);
    const pos = calcCardPos(svgX, svgY);
    setHoverPreview({ agent, room, pos });
  }, [calcCardPos, pinnedPreview]);

  const hidePreview = useCallback(() => {
    hoverTimeout.current = setTimeout(() => setHoverPreview(null), 300);
  }, []);

  const keepPreview = useCallback(() => {
    clearTimeout(hoverTimeout.current);
  }, []);

  // Pan with middle mouse or drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0 && e.shiftKey) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx / zoom, y: panStart.current.panY + dy / zoom });
  }, [isPanning, zoom]);

  const onMouseUp = useCallback(() => setIsPanning(false), []);

  const resetView = useCallback(() => { setZoom(1.1); setPan({ x: 0, y: 0 }); }, []);

  const onJoystickPan = useCallback((dx: number, dy: number) => {
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  // Group agents by session
  const sessionAgents = useMemo(() => {
    const map = new Map<string, AgentState[]>();
    for (const a of agents) {
      const arr = map.get(a.session) || [];
      arr.push(a);
      map.set(a.session, arr);
    }
    return map;
  }, [agents]);

  // Layout: optionally merge solo rooms into "Oracles" cluster, arrange in circle
  const layout = useMemo(() => {
    const sessionList = sessions.map((s) => ({
      session: s,
      agents: sessionAgents.get(s.name) || [],
      style: roomStyle(s.name),
    }));

    type LayoutItem = typeof sessionList[0];
    let virtual: LayoutItem[];

    if (groupSolo) {
      const multi = sessionList.filter(s => s.agents.length > 1);
      const soloAgents = sessionList.filter(s => s.agents.length === 1).flatMap(s => s.agents);

      virtual = [];
      if (soloAgents.length > 0) {
        virtual.push({
          session: { name: "_oracles", windows: [] },
          agents: soloAgents,
          style: { accent: "#7e57c2", floor: "#1a1428", wall: "#120e1e", label: "Oracles" },
        });
      }
      virtual.push(...multi);
    } else {
      virtual = sessionList;
    }

    const cx = 640, cy = 460;
    const radius = Math.min(370, 160 + virtual.length * 28);

    return virtual.map((s, i) => {
      const angle = (i / virtual.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      return { ...s, x, y };
    });
  }, [sessions, sessionAgents, groupSolo]);

  // Persistent input buffer per agent (survives pin/unpin)
  const [inputBufs, setInputBufs] = useState<Record<string, string>>({});
  const getInputBuf = useCallback((target: string) => inputBufs[target] || "", [inputBufs]);
  const setInputBuf = useCallback((target: string, val: string) => {
    setInputBufs(prev => ({ ...prev, [target]: val }));
  }, []);

  // Click agent -> pin preview card
  const onAgentClick = useCallback(
    (agent: AgentState, svgX: number, svgY: number, room: { label: string; accent: string }) => {
      if (pinnedPreview) {
        addEvent(agent.target, "command", `clicked ${agent.name}`);
        return;
      }
      const pos = calcCardPos(svgX, svgY);
      pinnedByUser.current = true;
      setPinnedPreview({ agent, room, pos, svgX, svgY });
      setHoverPreview(null);
      send({ type: "subscribe", target: agent.target });
    },
    [calcCardPos, send, pinnedPreview, addEvent]
  );

  // Fullscreen -> close pin first, then open modal
  const onPinnedFullscreen = useCallback(() => {
    if (pinnedPreview) {
      const agent = pinnedPreview.agent;
      setPinnedPreview(null);
      setTimeout(() => onSelectAgent(agent), 150);
    }
  }, [pinnedPreview, onSelectAgent]);

  const onPinnedClose = useCallback(() => {
    setPinnedPreview(null);
  }, []);

  const pinnedRef = useRef<HTMLDivElement>(null);

  // Animate pinned card from hover position to center
  const [pinnedAnimPos, setPinnedAnimPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (pinnedPreview) {
      setPinnedAnimPos({ left: pinnedPreview.pos.x, top: pinnedPreview.pos.y });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const containerW = containerRef.current?.getBoundingClientRect().width || 800;
          setPinnedAnimPos({ left: (containerW - PREVIEW_CARD.width) / 2, top: 20 });
        });
      });
    } else {
      setPinnedAnimPos(null);
    }
  }, [pinnedPreview]);

  // Click outside pinned card to close
  useEffect(() => {
    if (!pinnedPreview) return;
    const handler = (e: MouseEvent) => {
      if (pinnedRef.current && !pinnedRef.current.contains(e.target as Node)) {
        setPinnedPreview(null);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [pinnedPreview]);

  // Build lookup: agent target -> { svgX, svgY, room style }
  const agentPositions = useMemo(() => {
    const map = new Map<string, { svgX: number; svgY: number; style: ReturnType<typeof roomStyle> }>();
    for (const s of layout) {
      const count = s.agents.length;
      s.agents.forEach((agent, ai) => {
        const angle = (ai / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
        const r = count === 1 ? 0 : Math.min(Math.max(70, 35 + count * 18) - 35, 35 + count * 6);
        map.set(agent.target, {
          svgX: s.x + Math.cos(angle) * r,
          svgY: s.y + Math.sin(angle) * r,
          style: s.style,
        });
      });
    }
    return map;
  }, [layout]);

  // Compute viewBox based on zoom and pan
  const isPortrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
  const baseH = isPortrait ? 650 : 1000;
  const vbW = 1200 / zoom;
  const vbH = baseH / zoom;
  const vbX = (1200 - vbW) / 2 - pan.x;
  const vbY = (baseH - vbH) / 2 - pan.y + (isPortrait ? 250 : 0);

  return {
    // State
    groupSolo, setGroupSolo,
    hoveredAgent, setHoveredAgent,
    hoverPreview, pinnedPreview, setPinnedPreview,
    pinnedByUser,
    showSearch, setShowSearch,
    showBroadcast, setShowBroadcast,
    multiMode, multiCards, dismissCard,
    zoom, setZoom, pan, isPanning,
    layout, agentPositions,
    pinnedAnimPos, pinnedRef,
    // Refs
    containerRef, svgRef,
    // Callbacks
    showPreview, hidePreview, keepPreview,
    onMouseDown, onMouseMove, onMouseUp,
    resetView, onJoystickPan,
    onAgentClick, onPinnedFullscreen, onPinnedClose,
    getInputBuf, setInputBuf,
    // ViewBox
    vbX, vbY, vbW, vbH,
  };
}

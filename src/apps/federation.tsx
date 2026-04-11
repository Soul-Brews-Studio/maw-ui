import { createRoot } from "react-dom/client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import "../index.css";
import { useWebSocket } from "../hooks/useWebSocket";
import { apiUrl } from "../lib/api";
import type { FeedEvent, FeedEventType } from "../lib/feed";

// ─── Types ───

interface AgentNode {
  id: string;
  node: string;
  x: number; y: number; z: number;
  syncPeers: string[];
  buddedFrom?: string;
  children: string[];
}

interface AgentEdge {
  source: string;
  target: string;
  type: "sync" | "lineage" | "message";
  count: number;
}

// ─── Colors ───

const MACHINE_HEX: Record<string, number> = {
  white: 0x00f5d4,          // bioluminescent cyan-green
  "oracle-world": 0x00bbf9, // deep water blue
  mba: 0x9b5de5,            // jellyfish purple
  "clinic-nat": 0xf15bb5,   // anemone pink
};
const PAL = [0x00f5d4, 0x00bbf9, 0x9b5de5, 0xfee440, 0x72efdd];
let ci = 0;
function machineHex(name: string): number {
  if (!MACHINE_HEX[name]) MACHINE_HEX[name] = PAL[ci++ % PAL.length];
  return MACHINE_HEX[name];
}
function machineCSS(name: string): string {
  return "#" + machineHex(name).toString(16).padStart(6, "0");
}
function statusCSS(s: string): string {
  return s === "busy" ? "#00f5d4" : s === "ready" ? "#00bbf9" : "#0a2a4a";
}

// ─── 3D Force layout ───

function layout3D(agents: AgentNode[], edges: AgentEdge[]) {
  const machines = [...new Set(agents.map(a => a.node))];
  // Hub at center, peers in triangle on xz plane
  const centers: Record<string, THREE.Vector3> = {};
  const hubIdx = machines.indexOf("white");
  const hub = hubIdx >= 0 ? machines.splice(hubIdx, 1)[0] : machines.shift()!;
  centers[hub] = new THREE.Vector3(0, 0, 0);
  const spread = 6;
  machines.forEach((m, i) => {
    const angle = (i / machines.length) * Math.PI * 2 - Math.PI / 2;
    centers[m] = new THREE.Vector3(Math.cos(angle) * spread, (Math.random() - 0.5) * 1.5, Math.sin(angle) * spread);
  });

  // Init agents near their cluster center
  for (const a of agents) {
    const c = centers[a.node] || new THREE.Vector3();
    a.x = c.x + (Math.random() - 0.5) * 2.5;
    a.y = c.y + (Math.random() - 0.5) * 2.5;
    a.z = c.z + (Math.random() - 0.5) * 2.5;
  }

  const byId = new Map(agents.map(a => [a.id, a]));

  // Simple force iterations
  for (let iter = 0; iter < 150; iter++) {
    const alpha = 0.4 * (1 - iter / 150);

    // Repulsion
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const a = agents[i], b = agents[j];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
        const minD = a.node === b.node ? 1.2 : 2.5;
        if (dist < minD) {
          const f = (minD - dist) / dist * alpha * 0.5;
          a.x -= dx * f; a.y -= dy * f; a.z -= dz * f;
          b.x += dx * f; b.y += dy * f; b.z += dz * f;
        }
      }
    }

    // Cluster attraction
    for (const a of agents) {
      const c = centers[a.node];
      if (!c) continue;
      a.x += (c.x - a.x) * alpha * 0.06;
      a.y += (c.y - a.y) * alpha * 0.06;
      a.z += (c.z - a.z) * alpha * 0.06;
    }

    // Edge attraction (sync)
    for (const e of edges) {
      if (e.type !== "sync") continue;
      const a = byId.get(e.source), b = byId.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
      if (dist > 3) {
        const f = (dist - 3) / dist * alpha * 0.015;
        a.x += dx * f; a.y += dy * f; a.z += dz * f;
        b.x -= dx * f; b.y -= dy * f; b.z -= dz * f;
      }
    }
  }
}

// ─── Burst / Beam types ───

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
  ring?: THREE.Mesh;
}

interface Beam {
  points: THREE.Points;
  src: THREE.Vector3;
  tgt: THREE.Vector3;
  phase: number;       // 0→1 travel progress
  speed: number;
  life: number;
  maxLife: number;
  color: number;
  landed: boolean;
}

interface Supernova {
  center: THREE.Vector3;
  particles: THREE.Points;
  velocities: Float32Array;
  layers: Float32Array; // 0=core, 1=mid, 2=outer — different speeds
  rings: THREE.Mesh[];  // gravitational wave rings
  phase: number;        // 0→5 seconds
  color: number;
}

// ─── App ───

function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    composer: EffectComposer;
    controls: OrbitControls;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    agentMeshes: Map<string, THREE.Mesh>;
    edgeLines: THREE.Group;
    particleSystem: THREE.Points | null;
    particleData: { src: THREE.Vector3; tgt: THREE.Vector3; phase: number; speed: number }[];
    starField: THREE.Points;
    labelRenderer: CSS2DRenderer;
    labels: CSS2DObject[];
    bursts: Burst[];
    beams: Beam[];
    supernovae: Supernova[];
  } | null>(null);

  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // version was sourced from /api/identity which is dead on stale pm2 — drop until restored.
  const [machines, setMachines] = useState<string[]>([]);
  const [lineages, setLineages] = useState<{ parent: string; child: string }[]>([]);

  const agentsRef = useRef(agents); agentsRef.current = agents;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const statusesRef = useRef(agentStatuses); statusesRef.current = agentStatuses;
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const hoveredRef = useRef(hovered); hoveredRef.current = hovered;

  // ─── Burst + Beam spawners ───

  const spawnBurst = useCallback((pos: THREE.Vector3, color: number, count = 60) => {
    const s = sceneRef.current;
    if (!s) return;

    // Particle explosion
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const c = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      // Random sphere direction
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 0.08 + Math.random() * 0.15;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    s.scene.add(points);

    // Expanding ring
    const ringGeo = new THREE.RingGeometry(0.01, 0.15, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.lookAt(s.camera.position);
    s.scene.add(ring);

    s.bursts.push({ points, velocities, life: 0, maxLife: 1.5, ring });
  }, []);

  const spawnBeam = useCallback((from: THREE.Vector3, to: THREE.Vector3, color: number) => {
    const s = sceneRef.current;
    if (!s) return;

    const count = 20;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) positions[i] = from.x + (i % 3 === 1 ? from.y : i % 3 === 2 ? from.z : from.x) * 0;
    // Initialize all at source
    for (let i = 0; i < count; i++) {
      positions[i * 3] = from.x;
      positions[i * 3 + 1] = from.y;
      positions[i * 3 + 2] = from.z;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.1,
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    s.scene.add(points);

    s.beams.push({ points, src: from.clone(), tgt: to.clone(), phase: 0, speed: 0.025, life: 0, maxLife: 3, color, landed: false });
  }, []);

  const spawnSupernova = useCallback((pos: THREE.Vector3, color: number) => {
    const s = sceneRef.current;
    if (!s) return;

    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const layers = new Float32Array(count);
    const c = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // 3 velocity layers: core (slow), mid, outer (fast)
      const layer = i < 60 ? 0 : i < 140 ? 1 : 2;
      layers[i] = layer;
      const speed = layer === 0 ? 0.02 + Math.random() * 0.03
                 : layer === 1 ? 0.06 + Math.random() * 0.08
                 : 0.12 + Math.random() * 0.2;
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;
      // Color gradient: core=white, mid=color, outer=dimmer
      const blend = layer === 0 ? 0.9 : layer === 1 ? 0.5 : 0.2;
      colors[i * 3] = c.r * (1 - blend) + blend;
      colors[i * 3 + 1] = c.g * (1 - blend) + blend;
      colors[i * 3 + 2] = c.b * (1 - blend) + blend;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(geo, mat);
    s.scene.add(particles);

    // Gravitational wave rings (3 rings with staggered delays)
    const rings: THREE.Mesh[] = [];
    for (let r = 0; r < 3; r++) {
      const ringGeo = new THREE.TorusGeometry(0.1, 0.03, 8, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      // Random tilt for each ring
      ring.rotation.x = Math.random() * Math.PI;
      ring.rotation.z = Math.random() * Math.PI;
      s.scene.add(ring);
      rings.push(ring);
    }

    s.supernovae.push({ center: pos.clone(), particles, velocities, layers, rings, phase: 0, color });
  }, []);

  // ─── Trigger effects from WS events ───

  const triggerEffect = useCallback((agentId: string, eventType: FeedEventType) => {
    const s = sceneRef.current;
    if (!s) return;
    const mesh = s.agentMeshes.get(agentId);
    if (!mesh) return;
    const pos = mesh.position.clone();
    const agent = agentsRef.current.find(a => a.id === agentId);
    const color = agent ? machineHex(agent.node) : 0x00f5d4;

    // Big burst on activity
    if (eventType === "UserPromptSubmit") {
      spawnBurst(pos, 0xffffff, 80); // white flash for human input
      spawnSupernova(pos, color); // supernova on top
    } else if (eventType === "SubagentStart") {
      spawnBurst(pos, color, 50);
      spawnSupernova(pos, color); // supernova on top
      // Beam to a random sync peer
      if (agent?.syncPeers.length) {
        const peer = agent.syncPeers[Math.floor(Math.random() * agent.syncPeers.length)];
        const peerMesh = s.agentMeshes.get(peer);
        if (peerMesh) spawnBeam(pos, peerMesh.position.clone(), color);
      }
    } else if (eventType === "PreToolUse") {
      spawnBurst(pos, color, 30);
    } else if (eventType === "PostToolUseFailure") {
      spawnBurst(pos, 0xff3333, 50); // red burst on failure
    }

    // Plugin events — nervous system lighting up
    if (eventType === "PluginHook") {
      spawnBurst(pos, 0x00f5d4, 40); // bioluminescent pulse
      // Beam to all sync peers — hook ripples through the mesh
      if (agent?.syncPeers.length) {
        for (const peer of agent.syncPeers) {
          const peerMesh = s.agentMeshes.get(peer);
          if (peerMesh && Math.random() < 0.5) spawnBeam(pos, peerMesh.position.clone(), 0x00f5d4);
        }
      }
    } else if (eventType === "PluginFilter") {
      spawnBurst(pos, 0x9b5de5, 35); // purple filter ripple
    } else if (eventType === "PluginLoad") {
      spawnBurst(pos, 0x00bbf9, 60); // big blue burst — new plugin alive
      spawnSupernova(pos, 0x00bbf9);
    } else if (eventType === "PluginError") {
      spawnBurst(pos, 0xff3333, 45); // red error flash
    }

    // Beam to a connected agent on tool use (if edges exist)
    if (eventType === "PreToolUse" && agent) {
      const msgEdges = edgesRef.current.filter(e =>
        e.type === "message" && (e.source === agentId || e.target === agentId)
      );
      if (msgEdges.length > 0) {
        const e = msgEdges[Math.floor(Math.random() * msgEdges.length)];
        const peer = e.source === agentId ? e.target : e.source;
        const peerMesh = s.agentMeshes.get(peer);
        if (peerMesh && Math.random() < 0.3) { // 30% chance to avoid spam
          spawnBeam(pos, peerMesh.position.clone(), 0x00f5d4);
        }
      }
    }
  }, [spawnBurst, spawnBeam, spawnSupernova]);

  // WS
  const BUSY = useMemo(() => new Set<FeedEventType>(["PreToolUse", "PostToolUse", "UserPromptSubmit", "SubagentStart", "PostToolUseFailure", "PluginHook", "PluginFilter", "PluginLoad"]), []);
  const STOP = useMemo(() => new Set<FeedEventType>(["Stop", "SessionEnd", "Notification"]), []);

  const handleMessage = useCallback((data: any) => {
    if (data.type === "feed") {
      const e = data.event as FeedEvent;
      if (BUSY.has(e.event)) setAgentStatuses(p => ({ ...p, [e.oracle]: "busy" }));
      else if (STOP.has(e.event)) setAgentStatuses(p => ({ ...p, [e.oracle]: "ready" }));
      // Trigger visual effect
      triggerEffect(e.oracle, e.event);
    } else if (data.type === "feed-history") {
      const st: Record<string, string> = {};
      for (const e of (data.events as FeedEvent[])) {
        if (BUSY.has(e.event)) st[e.oracle] = "busy";
        else if (STOP.has(e.event)) st[e.oracle] = "ready";
      }
      setAgentStatuses(st);
    }
  }, [BUSY, STOP, triggerEffect]);

  const { connected } = useWebSocket(handleMessage);

  // ─── Three.js setup ───
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth, H = el.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020a18);
    scene.fog = new THREE.FogExp2(0x020a18, 0.02);

    // Camera
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.set(8, 6, 10);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    // CSS2D label renderer (overlays HTML on 3D)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(W, H);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    el.style.position = "relative";
    el.appendChild(labelRenderer.domElement);

    // Bloom
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.2, 0.5, 0.1);
    composer.addPass(bloom);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.maxDistance = 30;
    controls.minDistance = 3;

    // Lights
    scene.add(new THREE.AmbientLight(0x061830, 0.8));
    const point = new THREE.PointLight(0x00bbf9, 0.6, 50);
    point.position.set(0, 8, 0);
    scene.add(point);
    const dirLight = new THREE.DirectionalLight(0x80e0ff, 0.4);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    // Caustic ripple light from below
    const causticLight = new THREE.PointLight(0x00f5d4, 0.3, 40);
    causticLight.position.set(0, -5, 0);
    scene.add(causticLight);

    // Bioluminescent particles — deep ocean plankton
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 70;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      const t = Math.random();
      // Bioluminescent: cyan-green, deep blue, rare purple
      starColors[i * 3] = t < 0.4 ? 0.0 : t < 0.7 ? 0.0 : 0.6;
      starColors[i * 3 + 1] = t < 0.4 ? 0.9 + Math.random() * 0.1 : t < 0.7 ? 0.7 : 0.3;
      starColors[i * 3 + 2] = t < 0.4 ? 0.8 : t < 0.7 ? 1.0 : 0.9;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Grid helper (subtle)
    const grid = new THREE.GridHelper(30, 30, 0x051525, 0x030c18);
    grid.position.y = -3;
    scene.add(grid);

    // Groups
    const edgeLines = new THREE.Group();
    scene.add(edgeLines);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);

    sceneRef.current = {
      scene, camera, composer, controls, raycaster, mouse,
      agentMeshes: new Map(),
      edgeLines,
      particleSystem: null,
      particleData: [],
      starField,
      labelRenderer,
      labels: [],
      bursts: [],
      beams: [],
      supernovae: [],
    };

    // Resize
    function onResize() {
      const w = el!.clientWidth, h = el!.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer.setSize(w, h);
      labelRenderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    // Animate
    let time = 0;
    function animate() {
      requestAnimationFrame(animate);
      time += 0.016;
      controls.update();

      const s = sceneRef.current;
      if (!s) return;

      // Bioluminescent drift — slow, organic
      starField.rotation.y += 0.00008;
      starField.rotation.x += 0.00003;
      (starField.material as THREE.PointsMaterial).opacity = 0.35 + Math.sin(time * 0.8) * 0.1;
      // Caustic light ripple
      causticLight.intensity = 0.2 + Math.sin(time * 2.0) * 0.15 + Math.sin(time * 3.3) * 0.08;

      // Update agent materials based on status
      for (const [id, mesh] of s.agentMeshes) {
        const status = statusesRef.current[id] || "idle";
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const isSel = selectedRef.current === id;
        const isHov = hoveredRef.current === id;

        if (status === "busy") {
          const pulse = Math.sin(time * 4) * 0.5 + 1.5;
          mat.emissiveIntensity = pulse;
          mesh.scale.setScalar(1 + Math.sin(time * 3) * 0.15);
        } else if (status === "ready") {
          mat.emissiveIntensity = 0.6;
          mesh.scale.setScalar(1);
        } else {
          const idlePulse = 0.15 + Math.sin(time * 1.5 + mesh.position.x * 2) * 0.05;
          mat.emissiveIntensity = isSel ? 0.8 : isHov ? 0.5 : idlePulse;
          mesh.scale.setScalar(isSel ? 1.1 : 1);
        }
      }

      // Animate particles
      if (s.particleSystem && s.particleData.length > 0) {
        const positions = s.particleSystem.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < s.particleData.length; i++) {
          const p = s.particleData[i];
          p.phase = (p.phase + p.speed) % 1;
          const x = p.src.x + (p.tgt.x - p.src.x) * p.phase;
          const y = p.src.y + (p.tgt.y - p.src.y) * p.phase;
          const z = p.src.z + (p.tgt.z - p.src.z) * p.phase;
          positions.setXYZ(i, x, y, z);
        }
        positions.needsUpdate = true;
      }

      // Animate bursts
      for (let i = s.bursts.length - 1; i >= 0; i--) {
        const b = s.bursts[i];
        b.life += 0.016;
        const t = b.life / b.maxLife;

        if (t >= 1) {
          s.scene.remove(b.points);
          b.points.geometry.dispose();
          (b.points.material as THREE.Material).dispose();
          if (b.ring) { s.scene.remove(b.ring); b.ring.geometry.dispose(); (b.ring.material as THREE.Material).dispose(); }
          s.bursts.splice(i, 1);
          continue;
        }

        // Expand particles outward
        const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
        for (let j = 0; j < pos.count; j++) {
          pos.setX(j, pos.getX(j) + b.velocities[j * 3] * (1 - t));
          pos.setY(j, pos.getY(j) + b.velocities[j * 3 + 1] * (1 - t));
          pos.setZ(j, pos.getZ(j) + b.velocities[j * 3 + 2] * (1 - t));
        }
        pos.needsUpdate = true;
        (b.points.material as THREE.PointsMaterial).opacity = 1 - t * t;
        (b.points.material as THREE.PointsMaterial).size = 0.12 + t * 0.08;

        // Expand ring
        if (b.ring) {
          const scale = 1 + t * 12;
          b.ring.scale.setScalar(scale);
          (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
          b.ring.lookAt(s.camera.position);
        }
      }

      // Animate beams
      for (let i = s.beams.length - 1; i >= 0; i--) {
        const b = s.beams[i];
        b.life += 0.016;
        b.phase = Math.min(b.phase + b.speed, 1);
        const t = b.life / b.maxLife;

        if (t >= 1) {
          s.scene.remove(b.points);
          b.points.geometry.dispose();
          (b.points.material as THREE.Material).dispose();
          s.beams.splice(i, 1);
          continue;
        }

        // Spread beam particles as a comet trail
        const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
        const head = b.phase;
        for (let j = 0; j < pos.count; j++) {
          const trail = head - (j / pos.count) * 0.3; // trailing spread
          const p = Math.max(0, Math.min(1, trail));
          const jitter = 0.02;
          pos.setX(j, b.src.x + (b.tgt.x - b.src.x) * p + (Math.random() - 0.5) * jitter);
          pos.setY(j, b.src.y + (b.tgt.y - b.src.y) * p + (Math.random() - 0.5) * jitter);
          pos.setZ(j, b.src.z + (b.tgt.z - b.src.z) * p + (Math.random() - 0.5) * jitter);
        }
        pos.needsUpdate = true;
        (b.points.material as THREE.PointsMaterial).opacity = 1 - t;

        // Burst at target on arrival
        if (b.phase >= 0.95 && !b.landed) {
          b.landed = true;
          // Find spawnBurst — call via a queued effect
          const burstPos = b.tgt.clone();
          const burstColor = b.color;
          // Inline mini-burst at target
          const count = 40;
          const geo = new THREE.BufferGeometry();
          const positions = new Float32Array(count * 3);
          const vels = new Float32Array(count * 3);
          for (let k = 0; k < count; k++) {
            positions[k * 3] = burstPos.x;
            positions[k * 3 + 1] = burstPos.y;
            positions[k * 3 + 2] = burstPos.z;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            const sp = 0.05 + Math.random() * 0.1;
            vels[k * 3] = Math.sin(ph) * Math.cos(th) * sp;
            vels[k * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp;
            vels[k * 3 + 2] = Math.cos(ph) * sp;
          }
          geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
          const mat = new THREE.PointsMaterial({ size: 0.1, color: burstColor, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
          const pts = new THREE.Points(geo, mat);
          s.scene.add(pts);
          s.bursts.push({ points: pts, velocities: vels, life: 0, maxLife: 1.0 });
        }
      }

      // Animate supernovae
      for (let i = s.supernovae.length - 1; i >= 0; i--) {
        const sn = s.supernovae[i];
        sn.phase += 0.016;
        const t = sn.phase / 5.0; // 5 second total duration

        if (t >= 1) {
          s.scene.remove(sn.particles);
          sn.particles.geometry.dispose();
          (sn.particles.material as THREE.Material).dispose();
          for (const ring of sn.rings) { s.scene.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); }
          s.supernovae.splice(i, 1);
          continue;
        }

        // Expand particles with Sedov-Taylor deceleration
        const snPos = sn.particles.geometry.attributes.position as THREE.BufferAttribute;
        const decel = Math.pow(1 - t, 0.4); // Sedov-Taylor power law
        for (let j = 0; j < snPos.count; j++) {
          const layerSpeed = sn.layers[j] === 0 ? 0.3 : sn.layers[j] === 1 ? 0.7 : 1.0;
          snPos.setX(j, snPos.getX(j) + sn.velocities[j * 3] * decel * layerSpeed);
          snPos.setY(j, snPos.getY(j) + sn.velocities[j * 3 + 1] * decel * layerSpeed);
          snPos.setZ(j, snPos.getZ(j) + sn.velocities[j * 3 + 2] * decel * layerSpeed);
        }
        snPos.needsUpdate = true;

        // Fade: bright start, slow fade
        const snOpacity = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
        (sn.particles.material as THREE.PointsMaterial).opacity = Math.max(0, snOpacity);
        (sn.particles.material as THREE.PointsMaterial).size = 0.15 + t * 0.1;

        // Gravitational wave rings — expand outward with staggered timing
        for (let r = 0; r < sn.rings.length; r++) {
          const ring = sn.rings[r];
          const ringT = Math.max(0, sn.phase - r * 0.4) / 3.0; // stagger 0.4s apart
          if (ringT > 0 && ringT < 1) {
            const scale = 1 + ringT * 20;
            ring.scale.setScalar(scale);
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - ringT) * (1 - ringT);
            ring.rotation.y += 0.02;
          }
        }

        // Gravitational wave wobble — displace ALL nearby agent meshes
        if (sn.phase > 0.1 && sn.phase < 3.0) {
          const waveRadius = sn.phase * 3; // expanding wave front
          const waveWidth = 1.5;
          for (const [, mesh] of s.agentMeshes) {
            const dist = mesh.position.distanceTo(sn.center);
            if (dist > waveRadius - waveWidth && dist < waveRadius + waveWidth) {
              const wobble = Math.sin(sn.phase * 8) * 0.03 * (1 - sn.phase / 3);
              mesh.position.y += wobble;
            }
          }
        }
      }

      composer.render();
      s.labelRenderer.render(s.scene, s.camera);
    }
    animate();

    // Cleanup
    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      el.removeChild(labelRenderer.domElement);
    };
  }, []);

  // ─── Build 3D scene from data ───
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || agents.length === 0) return;

    // Clear old meshes + labels
    for (const [, mesh] of s.agentMeshes) s.scene.remove(mesh);
    s.agentMeshes.clear();
    for (const label of s.labels) s.scene.remove(label);
    s.labels = [];
    while (s.edgeLines.children.length) s.edgeLines.remove(s.edgeLines.children[0]);
    if (s.particleSystem) { s.scene.remove(s.particleSystem); s.particleSystem = null; }

    const byId = new Map(agents.map(a => [a.id, a]));

    // Agent spheres — clean, minimal
    const sphereGeo = new THREE.SphereGeometry(0.18, 24, 24);
    for (const agent of agents) {
      const hex = machineHex(agent.node);
      const mat = new THREE.MeshStandardMaterial({
        color: hex,
        emissive: hex,
        emissiveIntensity: 0.7,
        metalness: 0.1,
        roughness: 0.2,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.set(agent.x, agent.y, agent.z);
      mesh.userData = { id: agent.id };
      s.scene.add(mesh);
      s.agentMeshes.set(agent.id, mesh);

      // Agent name label
      const labelDiv = document.createElement("div");
      labelDiv.textContent = agent.id;
      labelDiv.style.cssText = `font-size:9px;font-family:monospace;color:rgba(255,255,255,0.5);text-shadow:0 0 4px ${machineCSS(agent.node)};pointer-events:none;`;
      const label = new CSS2DObject(labelDiv);
      label.position.set(0, 0.35, 0);
      mesh.add(label);
      s.labels.push(label);
    }

    // Machine cluster labels
    const clusters: Record<string, THREE.Vector3[]> = {};
    for (const a of agents) (clusters[a.node] ||= []).push(new THREE.Vector3(a.x, a.y, a.z));
    for (const [name, positions] of Object.entries(clusters)) {
      const center = new THREE.Vector3();
      for (const p of positions) center.add(p);
      center.divideScalar(positions.length);
      const mDiv = document.createElement("div");
      mDiv.textContent = name;
      mDiv.style.cssText = `font-size:11px;font-weight:bold;font-family:monospace;color:${machineCSS(name)};text-shadow:0 0 8px ${machineCSS(name)};pointer-events:none;opacity:0.6;`;
      const mLabel = new CSS2DObject(mDiv);
      mLabel.position.copy(center);
      mLabel.position.y += 1.5;
      s.scene.add(mLabel);
      s.labels.push(mLabel);
    }

    // Edge lines
    for (const edge of edges) {
      const a = byId.get(edge.source), b = byId.get(edge.target);
      if (!a || !b) continue;

      const points = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
      const geo = new THREE.BufferGeometry().setFromPoints(points);

      let color: number, opacity: number;
      if (edge.type === "message") {
        color = 0x00f5d4; opacity = 0.4;
      } else if (edge.type === "lineage") {
        color = 0xfbbf24; opacity = 0.2;
      } else {
        color = machineHex(a.node); opacity = 0.08;
      }

      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity,
        ...(edge.type === "lineage" ? {} : {}),
      });
      const line = new THREE.Line(geo, mat);
      if (edge.type === "lineage") line.computeLineDistances(); // for dashing
      s.edgeLines.add(line);
    }

    // Particles along edges
    const particleData: typeof s.particleData = [];
    for (const edge of edges) {
      if (edge.type === "sync" && edge.count === 0) continue; // skip quiet sync
      const a = byId.get(edge.source), b = byId.get(edge.target);
      if (!a || !b) continue;
      const src = new THREE.Vector3(a.x, a.y, a.z);
      const tgt = new THREE.Vector3(b.x, b.y, b.z);
      const n = edge.type === "message" ? Math.min(8, edge.count + 2) : 1;
      for (let i = 0; i < n; i++) {
        particleData.push({
          src, tgt,
          phase: Math.random(),
          speed: 0.002 + Math.random() * 0.003,
        });
      }
    }

    if (particleData.length > 0) {
      const pGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(particleData.length * 3);
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      const pMat = new THREE.PointsMaterial({
        size: 0.06,
        color: 0x00f5d4,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const points = new THREE.Points(pGeo, pMat);
      s.scene.add(points);
      s.particleSystem = points;
    }
    s.particleData = particleData;

  }, [agents, edges]);

  // ─── Data fetching ───
  // Canonical v1 endpoints — see ψ/memory/feedback_ground_before_proposing.md
  useEffect(() => {
    async function load() {
      const [config, fleetConfig, feed] = await Promise.all([
        fetch(apiUrl("/api/config")).then(r => r.json()).catch(() => null),
        fetch(apiUrl("/api/fleet-config")).then(r => r.json()).catch(() => null),
        fetch(apiUrl("/api/feed?limit=200")).then(r => r.json()).catch(() => null),
      ]);

      const a2m: Record<string, string> = {};
      if (config?.agents) for (const [a, m] of Object.entries(config.agents)) a2m[a] = m as string;

      // /api/fleet-config returns {configs: [...]}. budded_from is per-entry;
      // children are computed by inverting client-side (no children field on the new endpoint).
      const fleetMap: Record<string, { syncPeers: string[]; buddedFrom?: string; children: string[] }> = {};
      if (fleetConfig?.configs) {
        for (const f of fleetConfig.configs) {
          const name = f.windows?.[0]?.name?.replace(/-oracle$/, "") || f.name.replace(/^\d+-/, "");
          fleetMap[name] = {
            syncPeers: (f.sync_peers || []).filter((p: string) => p !== "--help"),
            buddedFrom: f.budded_from || undefined,
            children: [],
          };
        }
        for (const [child, entry] of Object.entries(fleetMap)) {
          if (entry.buddedFrom && fleetMap[entry.buddedFrom]) {
            fleetMap[entry.buddedFrom].children.push(child);
          }
        }
      }

      // Build agents
      const agentList: AgentNode[] = [];
      const seen = new Set<string>();
      for (const [name, machine] of Object.entries(a2m)) {
        if (seen.has(name)) continue;
        seen.add(name);
        const fm = fleetMap[name];
        agentList.push({
          id: name, node: machine, x: 0, y: 0, z: 0,
          syncPeers: fm?.syncPeers || [],
          buddedFrom: fm?.buddedFrom,
          children: fm?.children || [],
        });
      }

      // Build edges
      const edgeSet = new Set<string>();
      const edgeList: AgentEdge[] = [];
      const lineageList: { parent: string; child: string }[] = [];

      function addEdge(src: string, tgt: string, type: AgentEdge["type"], count = 1) {
        const key = `${type}:${[src, tgt].sort().join("-")}`;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        edgeList.push({ source: src, target: tgt, type, count });
      }

      for (const agent of agentList) {
        for (const peer of agent.syncPeers) {
          if (seen.has(peer)) addEdge(agent.id, peer, "sync");
        }
        if (agent.buddedFrom && seen.has(agent.buddedFrom)) {
          addEdge(agent.buddedFrom, agent.id, "lineage");
          lineageList.push({ parent: agent.buddedFrom, child: agent.id });
        }
        for (const child of agent.children) {
          if (seen.has(child)) {
            addEdge(agent.id, child, "lineage");
            lineageList.push({ parent: agent.id, child });
          }
        }
      }

      // Message edges — derived from /api/feed MessageSend events.
      if (feed?.events) {
        const msgCounts: Record<string, number> = {};
        for (const e of feed.events) {
          if (e.event !== "MessageSend" || !e.message) continue;
          const colonIdx = e.message.indexOf(": ");
          if (colonIdx <= 0) continue;
          const from = e.oracle?.replace(/^.*:/, "").replace(/-oracle$/, "") || "";
          const to = e.message.slice(0, colonIdx).replace(/^.*:/, "").replace(/-oracle$/, "");
          if (from && to && seen.has(from) && seen.has(to) && from !== to) {
            const key = [from, to].sort().join("-");
            msgCounts[key] = (msgCounts[key] || 0) + 1;
          }
        }
        for (const [key, count] of Object.entries(msgCounts)) {
          const [a, b] = key.split("-");
          addEdge(a, b, "message", count);
        }
      }

      // Run 3D force layout
      layout3D(agentList, edgeList);

      setAgents(agentList);
      setEdges(edgeList);
      setLineages(lineageList);
      setMachines([...new Set(agentList.map(a => a.node))]);
    }

    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, []);

  // ─── Raycaster click/hover ───
  const handlePointerMove = useCallback((e: React.MouseEvent) => {
    const el = mountRef.current;
    const s = sceneRef.current;
    if (!el || !s) return;
    const rect = el.getBoundingClientRect();
    s.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    s.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(s.mouse, s.camera);

    const meshes = [...s.agentMeshes.values()];
    const intersects = s.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const id = intersects[0].object.userData.id;
      setHovered(id);
      el.style.cursor = "pointer";
      // Dock magnification — nearby agents grow
      const hitPoint = intersects[0].point;
      for (const [, m] of s.agentMeshes) {
        const dist = m.position.distanceTo(hitPoint);
        const magRadius = 3;
        if (dist < magRadius) {
          const mag = 1 + 0.4 * Math.pow(1 - dist / magRadius, 2);
          m.scale.setScalar(mag);
        }
        // Note: don't reset here — let the animate loop handle non-hovered scales
      }
    } else {
      setHovered(null);
      el.style.cursor = "default";
    }
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const el = mountRef.current;
    const s = sceneRef.current;
    if (!el || !s) return;
    const rect = el.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    s.raycaster.setFromCamera(mouse, s.camera);
    const meshes = [...s.agentMeshes.values()];
    const intersects = s.raycaster.intersectObjects(meshes);
    if (intersects.length > 0) {
      const id = intersects[0].object.userData.id;
      setSelected(prev => prev === id ? null : id);
      // Stop auto-rotate on selection
      s.controls.autoRotate = false;
    } else {
      setSelected(null);
      s.controls.autoRotate = true;
    }
  }, []);

  // Highlight selected agent edges
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    // Dim/brighten meshes based on selection
    for (const [id, mesh] of s.agentMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isConnected = selected && edges.some(e =>
        (e.source === selected && e.target === id) || (e.target === selected && e.source === id)
      );
      if (selected && id !== selected && !isConnected) {
        mat.opacity = 0.2;
      } else {
        mat.opacity = 0.9;
      }
    }
  }, [selected, edges]);

  const selAgent = agents.find(a => a.id === selected);
  const selEdges = edges.filter(e => e.source === selected || e.target === selected);
  const totalAgents = agents.length;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#020a18" }}>
      <header className="flex items-center gap-4 px-6 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xl">🕸</span>
          <h1 className="text-lg font-black tracking-tight" style={{ color: "#00f5d4" }}>Federation Mesh</h1>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/20">
          <span>{machines.length} machines</span>
          <span>·</span>
          <span>{totalAgents} agents</span>
          <span>·</span>
          <span>{edges.filter(e => e.type === "message").reduce((s, e) => s + e.count, 0)} msg</span>
          <span>·</span>
          <span>{edges.filter(e => e.type === "sync").length} sync</span>
          <span>·</span>
          <span className="text-cyan-400/40">{lineages.length} lineage</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {machines.map(m => (
            <span key={m} className="flex items-center gap-1 text-[9px] font-mono" style={{ color: machineCSS(m) }}>
              <span className="w-2 h-2 rounded-full" style={{ background: machineCSS(m) }} />{m}
            </span>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Three.js viewport */}
        <div ref={mountRef} className="flex-1" onPointerMove={handlePointerMove} onClick={handleClick} />

        {/* Sidebar */}
        <div className="w-[240px] flex-shrink-0 border-l overflow-y-auto p-4 space-y-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {selAgent ? (
            <>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full" style={{ background: machineCSS(selAgent.node), boxShadow: `0 0 8px ${machineCSS(selAgent.node)}50` }} />
                  <span className="text-sm font-bold text-white/80">{selAgent.id}</span>
                </div>
                <div className="text-[10px] font-mono text-white/25 space-y-0.5 ml-5">
                  <div>Machine: <span style={{ color: machineCSS(selAgent.node) }}>{selAgent.node}</span></div>
                  <div>Status: <span style={{ color: statusCSS(agentStatuses[selAgent.id] || "idle") }}>{agentStatuses[selAgent.id] || "idle"}</span></div>
                  {selAgent.buddedFrom && <div>Budded from: <span className="text-cyan-400/60">{selAgent.buddedFrom}</span></div>}
                  {selAgent.children.length > 0 && <div>Children: <span className="text-cyan-400/60">{selAgent.children.join(", ")}</span></div>}
                </div>
              </div>

              {selAgent.syncPeers.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5 text-white/25">Sync Peers</div>
                  {selAgent.syncPeers.map(p => (
                    <div key={p} className="flex items-center gap-2 px-2 py-1 text-[10px] font-mono cursor-pointer hover:bg-white/[0.03] rounded"
                      onClick={() => setSelected(p)}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: machineCSS(agents.find(a => a.id === p)?.node || "") }} />
                      <span className="text-white/40">{p}</span>
                      <span className="text-[8px] ml-auto" style={{ color: statusCSS(agentStatuses[p] || "idle") }}>{agentStatuses[p] || "idle"}</span>
                    </div>
                  ))}
                </div>
              )}

              {selEdges.filter(e => e.type === "message").length > 0 && (
                <div>
                  <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5" style={{ color: "rgba(0,245,212,0.5)" }}>Messages</div>
                  {selEdges.filter(e => e.type === "message").map(e => {
                    const peer = e.source === selAgent.id ? e.target : e.source;
                    return (
                      <div key={peer} className="flex items-center gap-2 px-2 py-1 text-[10px] font-mono cursor-pointer hover:bg-white/[0.03] rounded"
                        onClick={() => setSelected(peer)}>
                        <span className="text-white/40">{e.source === selAgent.id ? "→" : "←"} {peer}</span>
                        <span className="text-white/15 ml-auto">{e.count}x</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div>
              <p className="text-[10px] text-white/20 mb-1">Click an agent sphere</p>
              <p className="text-[9px] text-white/10 mb-4">Scroll to zoom · Drag to orbit</p>
              {machines.map(m => {
                const mAgents = agents.filter(a => a.node === m);
                return (
                  <div key={m} className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: machineCSS(m) }} />
                      <span className="text-[10px] font-mono font-bold" style={{ color: machineCSS(m) }}>{m}</span>
                      <span className="text-[9px] font-mono text-white/15 ml-auto">{mAgents.length}</span>
                    </div>
                    {mAgents.map(a => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-0.5 text-[9px] font-mono cursor-pointer hover:bg-white/[0.03] rounded"
                        onClick={() => setSelected(a.id)}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusCSS(agentStatuses[a.id] || "idle") }} />
                        <span className="text-white/30">{a.id}</span>
                      </div>
                    ))}
                  </div>
                );
              })}

              {lineages.length > 0 && (
                <div className="mt-4">
                  <div className="text-[9px] font-mono tracking-wider uppercase mb-1.5 text-cyan-400/30">Lineage</div>
                  {lineages.map((l, i) => (
                    <div key={i} className="text-[9px] font-mono text-white/15 px-2 py-0.5">{l.parent} → {l.child}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

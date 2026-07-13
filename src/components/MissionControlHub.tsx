import { memo, useRef } from "react";
import { AgentAvatar } from "./AgentAvatar";
import { roomStyle } from "../lib/constants";
import type { AgentState } from "../lib/types";

interface MissionControlHubProps {
  agents: AgentState[];
  pinnedByUser: React.MutableRefObject<boolean>;
  setPinnedPreview: (val: { agent: AgentState; room: { label: string; accent: string }; pos: { x: number; y: number }; svgX: number; svgY: number } | null) => void;
}

export const MissionControlHub = memo(function MissionControlHub({
  agents,
  pinnedByUser,
  setPinnedPreview,
}: MissionControlHubProps) {
  // ON STAGE = actively working agents only. Since the server's 2s `recent`
  // push keeps every running-Claude agent stably "ready" (#70), including
  // ready here would park the entire fleet as grey ghosts in the hub —
  // they're already visible in their session clusters around the ring.
  const stageAgents = agents.filter(a => a.status === "busy");
  const busyCount = stageAgents.length;
  const hubR = Math.max(45, 30 + stageAgents.length * 25);
  const hasStage = stageAgents.length > 0;

  return (
    <>
      <circle cx={600} cy={500} r={hubR} fill="none" stroke={hasStage ? "#ffa726" : "#26c6da"} strokeWidth={hasStage ? 1.5 : 1} opacity={hasStage ? 0.3 : 0.15} />
      {!hasStage ? (
        <>
          <circle cx={600} cy={500} r={7} fill="#26c6da" opacity={0.4} />
          <text x={600} y={468} textAnchor="middle" fill="#26c6da" fontSize={12} opacity={0.5}
            fontFamily="'SF Mono', monospace" letterSpacing={5}>MISSION CONTROL</text>
        </>
      ) : (
        <>
          <text x={600} y={500 - hubR + 16} textAnchor="middle" fill="#ffa726" fontSize={10} opacity={0.7}
            fontFamily="'SF Mono', monospace" letterSpacing={3}>ON STAGE</text>
          <text x={600 + 38} y={500 - hubR + 17} textAnchor="start" fill="#ffa726" fontSize={9} opacity={0.5}
            fontFamily="'SF Mono', monospace">{busyCount > 0 ? busyCount : ""}</text>
          {stageAgents.map((a, i) => {
            const cols = Math.min(stageAgents.length, 4);
            const rows = Math.ceil(stageAgents.length / cols);
            const col = i % cols;
            const row = Math.floor(i / cols);
            const spacing = 65;
            const ax = 600 + (col - (cols - 1) / 2) * spacing;
            const ay = 500 + (row - (rows - 1) / 2) * spacing;
            const isBusy = a.status === "busy";
            return (
              <g key={a.target} transform={`translate(${ax},${ay})`} className="cursor-pointer"
                style={{ opacity: isBusy ? 1 : 0.35, filter: isBusy ? "none" : "grayscale(1)", transition: "opacity 1s, filter 1s" }}
                onClick={() => {
                  const room = roomStyle(a.session);
                  const pos = { x: window.innerWidth / 2 + 50, y: 80 };
                  pinnedByUser.current = true;
                  setPinnedPreview({ agent: a, room: { label: room.label, accent: room.accent }, pos, svgX: ax, svgY: ay });
                }}>
                <AgentAvatar name={a.name} target={a.target} status={a.status} preview="" accent={isBusy ? "#ffa726" : "#666"} onClick={() => {}} />
              </g>
            );
          })}
        </>
      )}
    </>
  );
});

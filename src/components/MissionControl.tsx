import { memo } from "react";
import { HoverPreviewCard } from "./HoverPreviewCard";
import { Joystick } from "./Joystick";
import { OracleSearch } from "./OracleSearch";
import { BottomStats } from "./BottomStats";
import { FpsCounter } from "./FpsCounter";
import { roomStyle, PREVIEW_CARD } from "../lib/constants";
import { MissionControlHub } from "./MissionControlHub";
import { MissionControlCluster } from "./MissionControlCluster";
import { useMissionControl } from "./useMissionControl";
import type { AgentState, Session, AgentEvent } from "../lib/types";
import type { Team } from "./TeamPanel";

interface MissionControlProps {
  sessions: Session[];
  agents: AgentState[];
  connected: boolean;
  send: (msg: object) => void;
  onSelectAgent: (agent: AgentState) => void;
  eventLog: AgentEvent[];
  addEvent: (target: string, type: AgentEvent["type"], detail: string) => void;
  teams?: Team[];
}

export const MissionControl = memo(function MissionControl({
  sessions,
  agents,
  connected,
  send,
  onSelectAgent,
  eventLog,
  addEvent,
  teams,
}: MissionControlProps) {
  const mc = useMissionControl({ sessions, agents, send, onSelectAgent, addEvent });

  return (
    <div
      ref={mc.containerRef}
      className="relative w-full overflow-hidden"
      style={{ background: "#020208", height: "calc(100vh - 60px)", cursor: mc.isPanning ? "grabbing" : "default" }}
      onMouseDown={mc.onMouseDown}
      onMouseMove={mc.onMouseMove}
      onMouseUp={mc.onMouseUp}
      onMouseLeave={mc.onMouseUp}
    >
      {/* SVG Mission Control */}
      <svg
        ref={mc.svgRef}
        viewBox={`${mc.vbX} ${mc.vbY} ${mc.vbW} ${mc.vbH}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="mc-bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1a3e" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#020208" stopOpacity={0} />
          </radialGradient>
          <filter id="mc-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
          </filter>
        </defs>

        {/* Background glow */}
        <circle cx={600} cy={500} r={500} fill="url(#mc-bg-glow)" />

        {/* Grid lines */}
        {Array.from({ length: 13 }, (_, i) => (
          <line key={`vl-${i}`} x1={i * 100} y1={0} x2={i * 100} y2={1000}
            stroke="#ffffff" strokeWidth={0.3} opacity={0.03} />
        ))}
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`hl-${i}`} x1={0} y1={i * 100} x2={1200} y2={i * 100}
            stroke="#ffffff" strokeWidth={0.3} opacity={0.03} />
        ))}

        {/* Orbital rings */}
        <circle cx={600} cy={500} r={150} fill="none" stroke="#26c6da" strokeWidth={0.5} opacity={0.08}
          strokeDasharray="4 8" />
        <circle cx={600} cy={500} r={300} fill="none" stroke="#7e57c2" strokeWidth={0.5} opacity={0.06}
          strokeDasharray="6 12" />
        <circle cx={600} cy={500} r={450} fill="none" stroke="#ffa726" strokeWidth={0.5} opacity={0.04}
          strokeDasharray="8 16" />

        {/* Center hub */}
        <MissionControlHub
          agents={agents}
          pinnedByUser={mc.pinnedByUser}
          setPinnedPreview={mc.setPinnedPreview}
        />

        {/* Connection lines from hub to sessions */}
        {mc.layout.map((s) => (
          <line key={`line-${s.session.name}`}
            x1={600} y1={500} x2={s.x} y2={s.y}
            stroke={s.style.accent} strokeWidth={0.5} opacity={0.08}
            strokeDasharray="2 6"
          />
        ))}

        {/* Session clusters */}
        {mc.layout.map((s) => (
          <MissionControlCluster
            key={s.session.name}
            item={s}
            hoveredAgent={mc.hoveredAgent}
            setHoveredAgent={mc.setHoveredAgent}
            hoverPreview={mc.hoverPreview}
            showPreview={mc.showPreview}
            hidePreview={mc.hidePreview}
            onAgentClick={mc.onAgentClick}
            teams={teams}
          />
        ))}
      </svg>

      {/* Controls — bottom right: pan + zoom + group toggle */}
      <div className="absolute bottom-4 right-6 flex flex-col items-center gap-1">
        <button
          onClick={() => mc.setGroupSolo(g => !g)}
          className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur border border-white/10 text-[9px] text-white/50 hover:text-white hover:bg-white/10 cursor-pointer font-mono"
          title={mc.groupSolo ? "Show all rooms" : "Group solo oracles"}
        >
          {mc.groupSolo ? "G" : "A"}
        </button>
        <div className="w-6 border-t border-white/[0.06] my-0.5" />
        <Joystick onPan={mc.onJoystickPan} />
        <div className="w-6 border-t border-white/[0.06] my-0.5" />
        <button onClick={() => mc.setZoom((z) => Math.min(3, z + 0.05))}
          className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-lg font-bold cursor-pointer">+</button>
        <button onClick={mc.resetView}
          className="w-8 h-6 rounded-lg bg-black/50 backdrop-blur border border-white/10 text-[9px] text-white/50 hover:text-white hover:bg-white/10 cursor-pointer font-mono">
          {Math.round(mc.zoom * 100)}%
        </button>
        <button onClick={() => mc.setZoom((z) => Math.max(0.5, z - 0.05))}
          className="w-8 h-8 rounded-lg bg-black/50 backdrop-blur border border-white/10 text-white/70 hover:text-white hover:bg-white/10 text-lg font-bold cursor-pointer">&minus;</button>
      </div>

      {/* Hover Preview Card */}
      {mc.hoverPreview && !mc.pinnedPreview && (
        <div
          className="absolute z-30 pointer-events-auto"
          style={{
            left: mc.hoverPreview.pos.x,
            top: mc.hoverPreview.pos.y,
            maxWidth: PREVIEW_CARD.width,
            animation: "fadeSlideIn 0.15s ease-out",
          }}
          onMouseEnter={mc.keepPreview}
          onMouseLeave={mc.hidePreview}
        >
          <HoverPreviewCard
            agent={mc.hoverPreview.agent}
            roomLabel={mc.hoverPreview.room.label}
            accent={mc.hoverPreview.room.accent}
          />
        </div>
      )}

      {/* Pinned Preview Card */}
      {mc.pinnedPreview && mc.pinnedAnimPos && (() => {
        const pinned = mc.pinnedPreview;
        return (
          <div
            ref={mc.pinnedRef}
            className="absolute z-40 pointer-events-auto"
            style={{
              left: mc.pinnedAnimPos.left,
              top: mc.pinnedAnimPos.top,
              maxWidth: PREVIEW_CARD.width,
              transition: "left 0.3s ease-out, top 0.3s ease-out",
            }}
          >
            <HoverPreviewCard
              agent={pinned.agent}
              roomLabel={pinned.room.label}
              accent={pinned.room.accent}
              pinned
              send={send}
              onFullscreen={mc.onPinnedFullscreen}
              onClose={mc.onPinnedClose}
              eventLog={eventLog}
              addEvent={addEvent}
              externalInputBuf={mc.getInputBuf(pinned.agent.target)}
              onInputBufChange={(val) => mc.setInputBuf(pinned.agent.target, val)}
            />
          </div>
        );
      })()}

      {/* Multi-card bar */}
      {mc.multiCards.size > 0 && !mc.pinnedPreview && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center gap-2 overflow-x-auto pointer-events-auto p-3" style={{ height: "calc(100vh - 80px)", scrollbarWidth: "none", background: "transparent" }}>
          {[...mc.multiCards].map(target => {
            const agent = agents.find(a => a.target === target);
            if (!agent) return null;
            const room = roomStyle(agent.session);
            return (
              <div key={target} style={{ flex: 1, minWidth: 280, maxWidth: 700, height: "100%" }}>
                <HoverPreviewCard
                  agent={agent}
                  roomLabel={room.label}
                  accent={room.accent}
                  pinned
                  compact
                  send={send}
                  onClose={() => mc.dismissCard(target)}
                  eventLog={eventLog}
                  addEvent={addEvent}
                  externalInputBuf={mc.getInputBuf(target)}
                  onInputBufChange={(val) => mc.setInputBuf(target, val)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom left buttons — search */}
      <div className="absolute bottom-4 left-6 flex items-center gap-2 z-20">
        <button
          onClick={() => mc.setShowSearch(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 backdrop-blur border border-white/10 text-white/50 hover:text-[#64b5f6] hover:border-[#64b5f6]/30 cursor-pointer transition-all"
          title="Search Oracle (⌘K)"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx={11} cy={11} r={8} />
            <line x1={21} y1={21} x2={16.65} y2={16.65} />
          </svg>
          <span className="text-[10px] font-mono">Oracle</span>
          <kbd className="text-[8px] text-white/20 ml-1">⌘K</kbd>
        </button>
      </div>

      {/* Oracle Search overlay */}
      {mc.showSearch && <OracleSearch onClose={() => mc.setShowSearch(false)} />}

      {/* Bottom stats + FPS */}
      <BottomStats agents={agents} />
      <FpsCounter />
    </div>
  );
});

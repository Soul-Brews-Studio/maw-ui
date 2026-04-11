import { memo } from "react";
import { agentColor } from "../lib/constants";

/** Shared chibi SVG avatar — same look as AgentAvatar but standalone */
// Inject SVG animation styles once — Safari needs these in a <style> inside <svg>
const SVG_ANIM_CSS = `
  @keyframes cp-typing { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes cp-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes cp-aura { 0%,100% { r: 30; opacity: 0.25; } 50% { r: 38; opacity: 0.08; } }
  @keyframes cp-spin { 0% { transform: scaleX(1); } 25% { transform: scaleX(0.15); } 50% { transform: scaleX(-1); } 75% { transform: scaleX(0.15); } 100% { transform: scaleX(1); } }
  .cp-typing-l { animation: cp-typing 0.3s ease-in-out infinite; transform-origin: -12px 10px; }
  .cp-typing-r { animation: cp-typing 0.3s ease-in-out 0.15s infinite; transform-origin: 12px 10px; }
  .cp-pulse { animation: cp-pulse 1.2s ease-in-out infinite; }
  .cp-aura { animation: cp-aura 2s ease-in-out infinite; }
  .cp-spin { animation: cp-spin 3s ease-in-out infinite; transform-origin: 0 0; }
`;

export const ChibiPortrait = memo(function ChibiPortrait({ name, size = 80, status }: { name: string; size?: number; status?: "busy" | "ready" | "idle" }) {
  const fullName = name.includes("-oracle") ? name : `${name}-oracle`;
  const color = agentColor(fullName);
  let h = 0;
  for (let i = 0; i < fullName.length; i++) h = ((h << 5) - h + fullName.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const hasEars = h % 3 === 0;
  const hasAntenna = !hasEars && h % 3 === 1;
  const eyeStyle = (h >> 4) % 3;
  const isBusy = status === "busy";

  return (
    <svg width={size} height={size} viewBox="-40 -45 80 80" style={{ overflow: "visible" }}>
      <defs><style>{SVG_ANIM_CSS}</style></defs>
      {/* Aura for busy */}
      {isBusy && (
        <circle cx={0} cy={-6} r={32} fill="none" stroke="#fdd835" strokeWidth={1.5} opacity={0.2} className="cp-aura" />
      )}
      {/* Ground shadow */}
      <ellipse cx={0} cy={24} rx={16} ry={4} fill={color} opacity={0.2} />
      {/* Body group — spins when busy */}
      <g className={isBusy ? "cp-spin" : ""}>
      {/* Body */}
      <rect x={-12} y={6} width={24} height={18} rx={8} fill={color} stroke="#fff" strokeWidth={1.5} opacity={0.9} />
      <rect x={-6} y={14} width={12} height={5} rx={2} fill="#000" opacity={0.12} />
      {/* Head */}
      <circle cx={0} cy={-10} r={20} fill={color} stroke="#fff" strokeWidth={2} />
      {/* Hair */}
      <ellipse cx={-4} cy={-28} rx={6} ry={4} fill={color} stroke="#fff" strokeWidth={1} />
      <ellipse cx={4} cy={-29} rx={5} ry={3} fill={color} stroke="#fff" strokeWidth={1} />
      {/* Cat ears */}
      {hasEars && <>
        <polygon points="-14,-24 -18,-36 -6,-28" fill={color} stroke="#fff" strokeWidth={1.5} />
        <polygon points="14,-24 18,-36 6,-28" fill={color} stroke="#fff" strokeWidth={1.5} />
        <polygon points="-13,-25 -16,-33 -8,-27" fill="#ffb4b4" opacity={0.4} />
        <polygon points="13,-25 16,-33 8,-27" fill="#ffb4b4" opacity={0.4} />
      </>}
      {/* Antenna */}
      {hasAntenna && <>
        <line x1={0} y1={-30} x2={0} y2={-40} stroke="#888" strokeWidth={1.5} />
        <circle cx={0} cy={-42} r={3} fill={isBusy ? "#fdd835" : "#4caf50"} className={isBusy ? "cp-pulse" : ""} />
      </>}
      {/* Eyes */}
      {eyeStyle === 0 && <>
        <circle cx={-7} cy={-12} r={4.5} fill="#fff" /><circle cx={7} cy={-12} r={4.5} fill="#fff" />
        <circle cx={-6} cy={-12} r={2.5} fill="#222" /><circle cx={8} cy={-12} r={2.5} fill="#222" />
        <circle cx={-5} cy={-13.5} r={1} fill="#fff" /><circle cx={9} cy={-13.5} r={1} fill="#fff" />
      </>}
      {eyeStyle === 1 && <>
        <path d="M -10 -12 Q -7 -15 -4 -12" fill="none" stroke="#222" strokeWidth={1.8} strokeLinecap="round" />
        <path d="M 4 -12 Q 7 -15 10 -12" fill="none" stroke="#222" strokeWidth={1.8} strokeLinecap="round" />
      </>}
      {eyeStyle === 2 && <>
        <circle cx={-7} cy={-12} r={4.5} fill="#fff" /><circle cx={7} cy={-12} r={4.5} fill="#fff" />
        <text x={-7} y={-9.5} textAnchor="middle" fill={color} fontSize={7} fontWeight="bold">*</text>
        <text x={7} y={-9.5} textAnchor="middle" fill={color} fontSize={7} fontWeight="bold">*</text>
      </>}
      {/* Blush */}
      <ellipse cx={-12} cy={-7} rx={3} ry={2} fill="#ff9999" opacity={0.25} />
      <ellipse cx={12} cy={-7} rx={3} ry={2} fill="#ff9999" opacity={0.25} />
      {/* Mouth */}
      {isBusy ? (
        <ellipse cx={0} cy={-4} rx={2.5} ry={2} fill="#333" />
      ) : (
        <path d="M -3 -5 Q 0 -2 3 -5" fill="none" stroke="#333" strokeWidth={1.2} strokeLinecap="round" />
      )}
      {/* Headphones */}
      <path d="M -17 -14 Q -18 -28 0 -30 Q 18 -28 17 -14" fill="none" stroke="#555" strokeWidth={2.5} />
      <rect x={-20} y={-18} width={6} height={10} rx={3} fill="#444" stroke="#555" strokeWidth={1} />
      <rect x={14} y={-18} width={6} height={10} rx={3} fill="#444" stroke="#555" strokeWidth={1} />
      <line x1={-19} y1={-10} x2={-14} y2={-2} stroke="#555" strokeWidth={1.2} />
      <circle cx={-13} cy={-1} r={1.5} fill="#666" />
      {/* Arms — typing when busy */}
      {isBusy ? <>
        <g className="cp-typing-l">
          <line x1={-12} y1={10} x2={-22} y2={18} stroke={color} strokeWidth={3} strokeLinecap="round" />
        </g>
        <g className="cp-typing-r">
          <line x1={12} y1={10} x2={22} y2={18} stroke={color} strokeWidth={3} strokeLinecap="round" />
        </g>
      </> : <>
        <line x1={-12} y1={10} x2={-16} y2={20} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <line x1={12} y1={10} x2={16} y2={20} stroke={color} strokeWidth={3} strokeLinecap="round" />
      </>}
      </g>{/* end spin group */}
      {/* Legs */}
      <line x1={-5} y1={23} x2={-6} y2={28} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={5} y1={23} x2={6} y2={28} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <ellipse cx={-7} cy={29} rx={3.5} ry={2} fill="#333" />
      <ellipse cx={7} cy={29} rx={3.5} ry={2} fill="#333" />
    </svg>
  );
});

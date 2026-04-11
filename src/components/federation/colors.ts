const MACHINE_COLORS: Record<string, string> = {
  white: "#00f5d4",          // bioluminescent cyan-green
  "oracle-world": "#00bbf9", // deep water blue
  mba: "#9b5de5",            // jellyfish purple
  "clinic-nat": "#f15bb5",   // anemone pink
};

const PALETTE = ["#00f5d4", "#00bbf9", "#9b5de5", "#fee440", "#72efdd"];
let cIdx = 0;

export function machineColor(name: string): string {
  if (!MACHINE_COLORS[name]) MACHINE_COLORS[name] = PALETTE[cIdx++ % PALETTE.length];
  return MACHINE_COLORS[name];
}

export function statusGlow(s: string): string {
  return s === "busy" ? "#00f5d4" : s === "ready" ? "#00bbf9" : "#0a2a4a";
}

export function hexRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

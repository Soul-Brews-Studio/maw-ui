// Mobile on-screen control-key bar for driving interactive TUIs (claude
// multi-selects, skill prompts) from a phone. Mobile soft keyboards cannot send
// Arrow / Enter / Tab / Esc to xterm.js, so interactive Oracle TUIs are
// unusable on mobile without this (Boss hit it live driving Nari's HR-migration
// scope prompt, 2026-06-06).
//
// Each button sends a RAW key sequence through the SAME shared-dashboard `send`
// command the mobile composer already uses ({type:"send", text, force:true}).
// The server-side `sendKeys` (maw-js core/transport/ssh.ts) maps these raw
// sequences to tmux key names with NO Enter appended:
//   \x1b[A→Up  \x1b[B→Down  \x1b[C→Right  \x1b[D→Left  \r→Enter  \x1b→Escape
// Tab (\t) and Space (0x20) go through tmux send-text as literals; Ctrl-C
// (\x03) is the same raw sequence the existing sleep/interrupt handler sends.
// So no server change is needed — this is a pure tap→existing-PTY-path wiring.
//
// onMouseDown preventDefault keeps the composer textarea focused so tapping a
// key never dismisses the soft keyboard. sm:hidden = mobile/touch only; desktop
// has a physical keyboard and doesn't need it.

interface KeyDef {
  label: string;
  seq: string;
  title: string;
  accent?: boolean; // Enter — the commit action
  danger?: boolean; // Ctrl-C — interrupt
}

const KEYS: KeyDef[] = [
  { label: "↑", seq: "\x1b[A", title: "Up" },
  { label: "↓", seq: "\x1b[B", title: "Down" },
  { label: "←", seq: "\x1b[D", title: "Left" },
  { label: "→", seq: "\x1b[C", title: "Right" },
  { label: "Enter", seq: "\r", title: "Enter / select", accent: true },
  { label: "Tab", seq: "\t", title: "Tab" },
  { label: "Esc", seq: "\x1b", title: "Escape" },
  { label: "␣", seq: " ", title: "Space" },
  { label: "⌃C", seq: "\x03", title: "Ctrl-C (interrupt)", danger: true },
];

export function TerminalKeyBar({ onKey }: { onKey: (seq: string) => void }) {
  return (
    <div
      className="sm:hidden flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-none border-t border-white/[0.06] shrink-0"
      style={{ background: "#0b0b12" }}
    >
      {KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          aria-label={k.title}
          title={k.title}
          onMouseDown={(e) => e.preventDefault()} // keep composer focus / keyboard up
          onClick={() => onKey(k.seq)}
          className={`flex-shrink-0 min-w-[40px] px-2.5 py-1.5 rounded-md text-[14px] font-mono leading-none active:scale-90 transition-all select-none border ${
            k.danger
              ? "text-red-300/80 border-red-300/25 hover:bg-red-300/10"
              : k.accent
              ? "text-emerald-300/90 border-emerald-300/30 bg-emerald-300/[0.06] hover:bg-emerald-300/15"
              : "text-white/70 border-white/10 hover:bg-white/[0.08]"
          }`}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

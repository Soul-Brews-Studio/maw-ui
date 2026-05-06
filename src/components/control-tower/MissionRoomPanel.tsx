import type { ProjectOperatingRoomRecord } from "../../lib/companyOsTypes";

function emptyList(label: string) {
  return <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3 text-sm text-white/35">{label}</div>;
}

export function MissionRoomPanel({ room }: { room?: ProjectOperatingRoomRecord }) {
  if (!room) {
    return emptyList("No Project Operating Room yet");
  }

  return (
    <section className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[2px] text-cyan-200/55">Mission Room</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{room.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/56">{room.mission}</p>
        </div>
        <div className="rounded border border-white/[0.07] bg-black/25 px-3 py-2 text-xs text-white/45">
          {room.status}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[1.6px] text-white/35">Context Capsule</div>
          <p className="mt-2 text-sm leading-6 text-white/58">{room.contextCapsule?.mission || "No capsule mission"}</p>
          <div className="mt-3 text-xs text-white/35">retrieval limit {room.contextCapsule?.retrievalLimit ?? 8}</div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[1.6px] text-white/35">Current State</div>
          <div className="mt-2 space-y-2">
            {(room.contextCapsule?.currentState || []).slice(0, 5).map((item) => (
              <div key={item} className="text-sm leading-5 text-white/56">{item}</div>
            ))}
            {(room.contextCapsule?.currentState || []).length === 0 && emptyList("No current state")}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[1.6px] text-white/35">Constraints</div>
          <div className="mt-2 space-y-2">
            {(room.contextCapsule?.constraints || []).slice(0, 5).map((item) => (
              <div key={item} className="text-sm leading-5 text-white/56">{item}</div>
            ))}
            {(room.contextCapsule?.constraints || []).length === 0 && emptyList("No constraints")}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[1.6px] text-white/35">Recent Summaries</div>
          <div className="space-y-2">
            {room.messages.slice(-5).reverse().map((message) => (
              <div key={message.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
                <div className="text-xs text-white/35">{message.author} | {message.role}</div>
                <div className="mt-1 text-sm leading-6 text-white/62">{message.summary}</div>
              </div>
            ))}
            {room.messages.length === 0 && emptyList("No summaries")}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[1.6px] text-white/35">Decision Log</div>
          <div className="space-y-2">
            {room.decisions.slice(-5).reverse().map((decision) => (
              <div key={decision.id} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-white/35">{decision.owner} | {decision.risk}</span>
                  <span className="text-cyan-100/70">{decision.status}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-white/78">{decision.title}</div>
                <div className="mt-1 text-sm leading-6 text-white/52">{decision.rationale}</div>
              </div>
            ))}
            {room.decisions.length === 0 && emptyList("No decisions")}
          </div>
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";

interface ScheduleEvent {
  id: number;
  title: string;
  description: string | null;
  oracle: string | null;
  startTime: string;
  endTime: string | null;
  recurrence: string | null;
  status: string;
  createdAt: string;
}

function timeAgo(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 0 || isNaN(diff)) return "upcoming";
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  upcoming: { bg: "rgba(59,130,246,0.08)", color: "#60a5fa", border: "rgba(59,130,246,0.2)" },
  active: { bg: "rgba(34,197,94,0.08)", color: "#22c55e", border: "rgba(34,197,94,0.2)" },
  done: { bg: "rgba(100,116,139,0.08)", color: "#94a3b8", border: "rgba(100,116,139,0.2)" },
  cancelled: { bg: "rgba(239,68,68,0.04)", color: "#ef4444", border: "rgba(239,68,68,0.15)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.upcoming;
  return (
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

function EventCard({ event, onStatusChange, onDelete }: { event: ScheduleEvent; onStatusChange: (id: number, status: string) => void; onDelete: (id: number) => void }) {
  const isPast = new Date(event.startTime) < new Date() && event.status === "upcoming";

  return (
    <div className="rounded-2xl p-5 transition-all" style={{
      background: event.status === "cancelled" ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${event.status === "cancelled" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"}`,
      opacity: event.status === "cancelled" ? 0.5 : 1,
    }}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-mono font-bold text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>{event.title}</h3>
            <StatusBadge status={isPast ? "active" : event.status} />
            {event.recurrence && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-md" style={{ background: "rgba(168,85,247,0.08)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}>
                {event.recurrence}
              </span>
            )}
          </div>

          {event.description && (
            <p className="font-mono text-xs mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>{event.description}</p>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              {formatDate(event.startTime)} {formatTime(event.startTime)}
            </span>
            {event.endTime && (
              <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                - {formatTime(event.endTime)}
              </span>
            )}
            {event.oracle && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-md" style={{ background: "rgba(34,211,238,0.08)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.15)" }}>
                {event.oracle}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {event.status !== "cancelled" && (
          <div className="flex items-center gap-1 shrink-0">
            {event.status === "upcoming" && (
              <button
                onClick={() => onStatusChange(event.id, "done")}
                className="px-2 py-1 rounded-lg font-mono text-[10px] transition-all active:scale-95 cursor-pointer"
                style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.15)" }}
                title="Mark done"
              >Done</button>
            )}
            <button
              onClick={() => onDelete(event.id)}
              className="px-2 py-1 rounded-lg font-mono text-[10px] transition-all active:scale-95 cursor-pointer"
              style={{ background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.1)" }}
              title="Cancel"
            >Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddEventForm({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [oracle, setOracle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !date || !time) return;
    setSaving(true);
    try {
      await apiFetch("/api/schedule", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          oracle: oracle.trim() || null,
          startTime: `${date}T${time}:00`,
          endTime: endTime ? `${date}T${endTime}:00` : null,
          recurrence: recurrence || null,
        }),
      });
      setTitle("");
      setDescription("");
      setOracle("");
      setEndTime("");
      setRecurrence("");
      setOpen(false);
      onAdd();
    } catch (e) {
      console.error("Failed to create event:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 cursor-pointer"
        style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}
      >
        + Add Event
      </button>
    );
  }

  const inputStyle = "bg-black/50 border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-cyan-400/30 placeholder:text-white/15 w-full";

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(34,197,94,0.15)" }}>
      <div className="font-mono text-[10px] mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>NEW EVENT</div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Event title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputStyle}
          autoFocus
        />

        <input
          type="text"
          placeholder="Description (optional)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputStyle}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputStyle}
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputStyle}
          />
          <input
            type="time"
            placeholder="End time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={inputStyle}
          />
          <input
            type="text"
            placeholder="Oracle (optional)"
            value={oracle}
            onChange={(e) => setOracle(e.target.value)}
            className={inputStyle}
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className={inputStyle + " max-w-[180px]"}
          >
            <option value="">No recurrence</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          <div className="flex-1" />

          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || saving}
            className="px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-30"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScheduleView() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "done">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59`);
      if (filter === "upcoming") params.set("status", "upcoming");
      if (filter === "done") params.set("status", "done");

      const qs = params.toString();
      const res = await apiFetch<{ events: ScheduleEvent[] }>(`/api/schedule${qs ? `?${qs}` : ""}`);
      setEvents(res.events || []);
    } catch (e) {
      console.error("Failed to fetch schedule:", e);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [filter, dateFrom, dateTo]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleStatusChange = useCallback(async (id: number, status: string) => {
    try {
      await apiFetch(`/api/schedule/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      fetchEvents();
    } catch (e) {
      console.error("Failed to update event:", e);
    }
  }, [fetchEvents]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await apiFetch(`/api/schedule/${id}`, { method: "DELETE" });
      fetchEvents();
    } catch (e) {
      console.error("Failed to cancel event:", e);
    }
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">📅</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Loading schedule...</p>
        </div>
      </div>
    );
  }

  const filterTabs = [
    { id: "all" as const, label: "All" },
    { id: "upcoming" as const, label: "Upcoming" },
    { id: "done" as const, label: "Done" },
  ];

  // Group events by date
  const grouped = new Map<string, ScheduleEvent[]>();
  for (const event of events) {
    const dateKey = event.startTime.slice(0, 10);
    const existing = grouped.get(dateKey) || [];
    existing.push(event);
    grouped.set(dateKey, existing);
  }

  const inputStyle = "bg-black/50 border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-cyan-400/30 placeholder:text-white/15";

  return (
    <div className="px-6 py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-mono" style={{ color: "#e2e8f0" }}>Schedule</h1>
          <p className="font-mono text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {events.length} event{events.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchEvents()}
            className="px-4 py-2 rounded-xl font-mono text-xs transition-all active:scale-95 cursor-pointer"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
          >
            Refresh
          </button>
          <AddEventForm onAdd={fetchEvents} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
          {filterTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className="py-2 px-4 rounded-lg font-mono text-xs transition-all cursor-pointer"
              style={{
                background: filter === t.id ? "rgba(168,85,247,0.12)" : "transparent",
                color: filter === t.id ? "#c084fc" : "rgba(255,255,255,0.4)",
                border: filter === t.id ? "1px solid rgba(168,85,247,0.2)" : "1px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputStyle}
            placeholder="From"
          />
          <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>-</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputStyle}
            placeholder="To"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="font-mono text-xs px-2 py-1 rounded cursor-pointer"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📅</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No events found</p>
          <p className="font-mono text-xs mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>Create your first event to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([dateKey, dateEvents]) => (
            <div key={dateKey}>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-3 px-1" style={{ color: "rgba(255,255,255,0.25)" }}>
                {formatDate(dateKey + "T00:00:00")}
              </div>
              <div className="space-y-2">
                {dateEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

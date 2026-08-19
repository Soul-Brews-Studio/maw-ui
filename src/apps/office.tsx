import { AppShell } from "../core/AppShell";
import { UniverseBg } from "../components/UniverseBg";
import { RoomGrid } from "../components/RoomGrid";

export default () => (
  <AppShell view="office">
    {(ctx) => (
      <>
        <UniverseBg />
        <div className="relative z-10">
          <RoomGrid sessions={ctx.sessions} agents={ctx.agents} onSelectAgent={ctx.onSelectAgent} />
        </div>
      </>
    )}
  </AppShell>
);

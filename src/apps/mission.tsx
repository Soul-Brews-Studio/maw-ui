import { AppShell } from "../core/AppShell";
import { MissionControl } from "../components/MissionControl";

export default () => (
  <AppShell view="mission">
    {(ctx) => (
      <MissionControl
        sessions={ctx.sessions}
        agents={ctx.agents}
        connected={ctx.connected}
        send={ctx.send}
        onSelectAgent={ctx.onSelectAgent}
        eventLog={ctx.eventLog}
        addEvent={ctx.addEvent}
        teams={ctx.teams}
      />
    )}
  </AppShell>
);

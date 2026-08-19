import { AppShell } from "../core/AppShell";
import { FleetGrid } from "../components/FleetGrid";

export default () => (
  <AppShell view="fleet">
    {(ctx) => (
      <FleetGrid
        sessions={ctx.sessions}
        agents={ctx.agents}
        connected={ctx.connected}
        send={ctx.send}
        onSelectAgent={ctx.onSelectAgent}
        eventLog={ctx.eventLog}
        addEvent={ctx.addEvent}
        feedActive={ctx.feedActive}
        agentFeedLog={ctx.agentFeedLog}
        teams={ctx.teams}
      />
    )}
  </AppShell>
);

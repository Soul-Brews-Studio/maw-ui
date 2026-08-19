import { AppShell } from "../core/AppShell";
import { DashboardView } from "../components/DashboardView";

export default () => (
  <AppShell view="dashboard">
    {(ctx) => (
      <DashboardView
        sessions={ctx.sessions}
        agents={ctx.agents}
        connected={ctx.connected}
        send={ctx.send}
        onSelectAgent={ctx.onSelectAgent}
        eventLog={ctx.eventLog}
        feedEvents={ctx.feedEvents}
        feedActive={ctx.feedActive}
        agentFeedLog={ctx.agentFeedLog}
      />
    )}
  </AppShell>
);

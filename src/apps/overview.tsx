import { AppShell } from "../core/AppShell";
import { OverviewGrid } from "../components/OverviewGrid";

export default () => (
  <AppShell view="overview">
    {(ctx) => (
      <OverviewGrid
        sessions={ctx.sessions}
        agents={ctx.agents}
        connected={ctx.connected}
        send={ctx.send}
        onSelectAgent={ctx.onSelectAgent}
      />
    )}
  </AppShell>
);

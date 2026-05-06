import { mount } from "../core/mount";
import { AppShell } from "../core/AppShell";
import { KaijuControlTower } from "../components/KaijuControlTower";

mount(() => (
  <AppShell view="control-tower">
    {(ctx) => (
      <KaijuControlTower
        agents={ctx.agents}
        connected={ctx.connected}
        onSelectAgent={ctx.onSelectAgent}
      />
    )}
  </AppShell>
));


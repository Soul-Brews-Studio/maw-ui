import { AppShell } from "../core/AppShell";
import { ConfigView } from "../components/ConfigView";

export default () => (
  <AppShell view="config" fullHeight>
    {() => <ConfigView />}
  </AppShell>
);

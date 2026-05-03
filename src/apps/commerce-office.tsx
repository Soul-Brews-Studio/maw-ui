import { mount } from "../core/mount";
import { AppShell } from "../core/AppShell";
import { KaijuCommerceOffice } from "../components/KaijuCommerceOffice";

mount(() => (
  <AppShell view="commerce-office">
    {() => <KaijuCommerceOffice />}
  </AppShell>
));

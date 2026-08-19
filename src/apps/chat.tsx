import { AppShell } from "../core/AppShell";
import { ChatView } from "../components/ChatView";

export default () => (
  <AppShell view="chat">
    {() => <ChatView />}
  </AppShell>
);

import { mount } from "../core/mount";
import { AppShell } from "../core/AppShell";
import { ChatView } from "../components/ChatView";

mount(() => (
  <AppShell view="chat">
    {(ctx) => <ChatView agents={ctx.agents} send={ctx.send} connected={ctx.connected} />}
  </AppShell>
));

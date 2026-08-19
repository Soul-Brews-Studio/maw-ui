import { mount } from "./core/mount";

const page = location.pathname.split("/").pop()?.replace(/\.html$/, "") || "index";
const applications = {
  index: () => import("./main"), mission: () => import("./apps/mission"), fleet: () => import("./apps/fleet"),
  dashboard: () => import("./apps/dashboard"), terminal: () => import("./apps/terminal"), office: () => import("./apps/office"),
  overview: () => import("./apps/overview"), chat: () => import("./apps/chat"), config: () => import("./apps/config"),
  inbox: () => import("./apps/inbox"), federation: () => import("./apps/federation"),
  federation_2d: () => import("./apps/federation_2d"), workspace: () => import("./apps/workspace"),
} satisfies Record<string, () => Promise<{ default: React.ComponentType }>>;
mount(applications[page as keyof typeof applications] ?? applications.index);

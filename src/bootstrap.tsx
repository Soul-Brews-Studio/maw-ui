import { OperatorGate } from "./components/OperatorGate";
import { mount } from "./core/mount";
import { hasOperatorCredential, subscribeOperatorCredential } from "./lib/api";
import "./index.css";
const loaders = {
  index: () => import("./main"),
  chat: () => import("./apps/chat"),
  config: () => import("./apps/config"),
  dashboard: () => import("./apps/dashboard"),
  fleet: () => import("./apps/fleet"),
  inbox: () => import("./apps/inbox"),
  mission: () => import("./apps/mission"),
  office: () => import("./apps/office"),
  overview: () => import("./apps/overview"),
  terminal: () => import("./apps/terminal"),
  federation: () => import("./apps/federation"),
  federation_2d: () => import("./apps/federation_2d"),
  workspace: () => import("./apps/workspace"),
} as const;
export const loaderForPath = (pathname: string) => {
  const basename = pathname.replace(/\/+$/, "").split("/").pop() || "index";
  const key = basename.endsWith(".html") ? basename.slice(0, -5) : basename;
  return Object.prototype.hasOwnProperty.call(loaders, key) ? loaders[key as keyof typeof loaders] : null;
};
export const deferOnce = (loader: () => Promise<unknown>, failed: () => void) => {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    queueMicrotask(() => loader().catch(failed));
  };
};
export function BootstrapBlocked() {
  return <main className="min-h-screen grid place-items-center bg-[#020a18] text-white/60">Application unavailable.</main>;
}

if (typeof document !== "undefined") {
  const loader = loaderForPath(location.pathname);
  if (!loader) mount(BootstrapBlocked);
  else {
    let launched = false;
    subscribeOperatorCredential(() => {
      if (launched && !hasOperatorCredential()) {
        mount(() => null);
        location.reload();
      }
    });
    const load = deferOnce(async () => {
      if (hasOperatorCredential()) await loader();
    }, () => mount(BootstrapBlocked));
    const launch = () => {
      launched = true;
      load();
    };
    mount(() => <OperatorGate onReady={launch} />);
  }
}

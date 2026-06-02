import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PinLock } from "./components/PinLock";
import { cacheBus } from "./lib/cache";

// Cross-tab cache invalidation: a write in one tab drops matching cache
// entries in every open tab. attachCrossTab() self-guards `typeof window`,
// so the browser check below is belt-and-suspenders for SSR/test contexts.
if (typeof window !== "undefined") {
  cacheBus.attachCrossTab();
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <PinLock>
      <App />
    </PinLock>
  </ErrorBoundary>
);

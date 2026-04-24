/** Shared mount helper — each app calls this with its view component */
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";

export function mount(App: () => ReactElement) {
  createRoot(document.getElementById("root")!).render(<App />);
}

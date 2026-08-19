/** Shared mount helper — each app calls this with its view component */
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

let root: Root | undefined;

export function mount(App: () => ReactElement | null) {
  root ??= createRoot(document.getElementById("root")!);
  root.render(<App />);
  return root;
}

import { mount } from "./core/mount";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

mount(() => (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
));

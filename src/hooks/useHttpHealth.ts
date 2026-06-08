import { useSyncExternalStore } from "react";
import { getHttpHealth, subscribeHttpHealth } from "../lib/api";

export function useHttpHealth() {
  return useSyncExternalStore(subscribeHttpHealth, getHttpHealth, getHttpHealth);
}

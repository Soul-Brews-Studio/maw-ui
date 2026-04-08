import { useEffect, useRef, useState, useCallback } from "react";
import { wsUrl } from "../lib/api";

type MessageHandler = (data: any) => void;

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

interface UseWebSocketOptions {
  /** WebSocket path (default: "/ws") */
  path?: string;
  /** Only call onMessage for these message types (if set) */
  types?: string[];
  /** Called on each (re)connect — use to re-subscribe */
  onConnect?: (send: (msg: object) => void) => void;
}

// ─── Singleton WebSocket manager ───────────────────────────────────
// All useWebSocket() calls share a single connection per path.
// Subscribers register callbacks; the manager fans out messages.

interface Subscriber {
  id: number;
  handler: MessageHandler;
  types?: string[];
  onConnect?: (send: (msg: object) => void) => void;
}

interface WsManager {
  ws: WebSocket | null;
  subscribers: Subscriber[];
  connected: boolean;
  reconnecting: boolean;
  alive: boolean;
  attempt: number;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  listeners: Set<() => void>;
}

const managers = new Map<string, WsManager>();
let nextSubId = 1;

function getManager(path: string): WsManager {
  let mgr = managers.get(path);
  if (!mgr) {
    mgr = {
      ws: null,
      subscribers: [],
      connected: false,
      reconnecting: false,
      alive: false,
      attempt: 0,
      reconnectTimer: undefined,
      listeners: new Set(),
    };
    managers.set(path, mgr);
  }
  return mgr;
}

function notifyListeners(mgr: WsManager) {
  for (const fn of mgr.listeners) fn();
}

function sendViaManager(mgr: WsManager, msg: object) {
  const ws = mgr.ws;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function ensureConnection(mgr: WsManager, path: string) {
  if (mgr.alive) return; // already running
  mgr.alive = true;
  mgr.attempt = 0;

  function connect() {
    if (!mgr.alive) return;
    const ws = new WebSocket(wsUrl(path));
    mgr.ws = ws;

    ws.onopen = () => {
      mgr.attempt = 0;
      mgr.connected = true;
      mgr.reconnecting = false;
      notifyListeners(mgr);
      // Notify all subscribers' onConnect callbacks
      const sendFn = (msg: object) => sendViaManager(mgr, msg);
      for (const sub of mgr.subscribers) {
        sub.onConnect?.(sendFn);
      }
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        for (const sub of mgr.subscribers) {
          if (sub.types && !sub.types.includes(data.type)) continue;
          sub.handler(data);
        }
      } catch {}
    };

    ws.onclose = () => {
      mgr.connected = false;
      if (mgr.alive) {
        mgr.reconnecting = true;
        notifyListeners(mgr);
        const delay = Math.min(BASE_DELAY * 2 ** mgr.attempt, MAX_DELAY);
        mgr.attempt++;
        mgr.reconnectTimer = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => ws.close();
  }

  connect();
}

function teardownIfEmpty(mgr: WsManager, path: string) {
  if (mgr.subscribers.length === 0) {
    mgr.alive = false;
    clearTimeout(mgr.reconnectTimer);
    mgr.ws?.close();
    mgr.ws = null;
    mgr.connected = false;
    mgr.reconnecting = false;
    managers.delete(path);
  }
}

/**
 * Shared WebSocket hook — singleton per path.
 * All views share one connection; messages are fanned out to subscribers.
 * Supports auto-reconnect with exponential backoff.
 */
export function useWebSocket(onMessage: MessageHandler, options?: UseWebSocketOptions) {
  const path = options?.path || "/ws";
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const subIdRef = useRef<number>(0);

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const mgr = getManager(path);
    const id = nextSubId++;
    subIdRef.current = id;

    const sub: Subscriber = {
      id,
      handler: (data: any) => onMessageRef.current(data),
      types: optionsRef.current?.types,
      onConnect: optionsRef.current?.onConnect,
    };

    mgr.subscribers.push(sub);

    // Sync initial state
    setConnected(mgr.connected);
    setReconnecting(mgr.reconnecting);

    // Listen for state changes
    const listener = () => {
      setConnected(mgr.connected);
      setReconnecting(mgr.reconnecting);
    };
    mgr.listeners.add(listener);

    // Start connection if not already running
    ensureConnection(mgr, path);

    // If already connected, fire onConnect immediately
    if (mgr.connected && sub.onConnect) {
      sub.onConnect((msg) => sendViaManager(mgr, msg));
    }

    return () => {
      mgr.listeners.delete(listener);
      mgr.subscribers = mgr.subscribers.filter((s) => s.id !== id);
      teardownIfEmpty(mgr, path);
    };
  }, [path]);

  const send = useCallback(
    (msg: object) => {
      const mgr = managers.get(path);
      if (mgr) sendViaManager(mgr, msg);
    },
    [path],
  );

  return { connected, reconnecting, send };
}

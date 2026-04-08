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

/**
 * Shared WebSocket hook with exponential backoff reconnection.
 * All views should use this instead of creating raw WebSocket connections.
 */
export function useWebSocket(onMessage: MessageHandler, options?: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;

    const sendFn = (msg: object) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    function connect() {
      if (!alive) return;
      const path = optionsRef.current?.path || "/ws";
      const ws = new WebSocket(wsUrl(path));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        setReconnecting(false);
        optionsRef.current?.onConnect?.(sendFn);
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const types = optionsRef.current?.types;
          if (types && !types.includes(data.type)) return;
          onMessageRef.current(data);
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (alive) {
          setReconnecting(true);
          const delay = Math.min(BASE_DELAY * 2 ** attempt, MAX_DELAY);
          attempt++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, reconnecting, send };
}

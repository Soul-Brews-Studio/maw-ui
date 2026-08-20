import { useEffect, useRef, useState, useCallback } from "react";
import { wsUrl, mintWsTicket, WS_PROTOCOL } from "../lib/api";

type MessageHandler = (data: any) => void;

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;

    function retryLater() {
      if (!alive) return;
      setReconnecting(true);
      const delay = Math.min(BASE_DELAY * 2 ** attempt, MAX_DELAY);
      attempt++;
      reconnectTimer = setTimeout(run, delay);
    }

    // connect() is async (ticket minting), so it can never be handed straight
    // to setTimeout — a synchronous throw from the WebSocket constructor would
    // become an unhandled rejection and silently kill the retry loop.
    function run() { connect().catch(retryLater); }

    async function connect() {
      if (!alive) return;
      // Tickets are one-use and origin-bound, so mint per connect AND per
      // reconnect. A null ticket means "no verified credential" — open
      // unticketed and let the server decide, which keeps pre-ticketing
      // maw-rs builds working.
      const ticket = await mintWsTicket("/ws");
      if (!alive) return;
      const ws = ticket
        ? new WebSocket(wsUrl("/ws"), [WS_PROTOCOL, ticket])
        : new WebSocket(wsUrl("/ws"));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        setReconnecting(false);
      };
      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)); } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        retryLater();
      };
      ws.onerror = () => ws.close();
    }

    run();
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

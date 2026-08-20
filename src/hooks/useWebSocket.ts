import { useEffect, useRef, useState, useCallback } from "react";
import { openWs, subscribeOperatorCredential, hasOperatorCredential } from "../lib/api";

type MessageHandler = (data: any) => void;

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

// Consecutive failed handshakes, with the socket never once opening, before we
// call it a refusal rather than a flaky network. Three is ~7s of backoff.
const REFUSED_AFTER = 3;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  // The browser deliberately hides the HTTP status of a failed WS handshake, so
  // a 401 upgrade rejection is indistinguishable from a dead host at the socket
  // API. What IS distinguishable: never opening even once, repeatedly. A host
  // that is merely down also fails HTTP, which the stale-data banner already
  // covers — so this signal is only surfaced alongside healthy HTTP.
  const [refused, setRefused] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let everOpened = false;

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
      const ws = await openWs("/ws");
      if (!alive) { ws.close(); return; }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        everOpened = true;
        setConnected(true);
        setReconnecting(false);
        setRefused(false);
      };
      ws.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)); } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        // Only a never-opened socket counts. A connection that worked and then
        // dropped is an ordinary disconnect, not the backend refusing us.
        if (!everOpened && attempt + 1 >= REFUSED_AFTER) setRefused(true);
        retryLater();
      };
      ws.onerror = () => ws.close();
    }

    run();

    // A credential arriving mid-backoff is exactly the case worth reacting to:
    // the operator just authenticated in response to the refusal banner, so the
    // next attempt can actually succeed. Waiting out an exponential delay here
    // would make the fix look broken.
    const unsubscribe = subscribeOperatorCredential(() => {
      if (!alive || !hasOperatorCredential()) return;
      clearTimeout(reconnectTimer);
      attempt = 0;
      wsRef.current?.close();
      run();
    });

    return () => {
      alive = false;
      unsubscribe();
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

  return { connected, reconnecting, refused, send };
}

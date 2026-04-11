import { useEffect, useRef, useState } from "react";
import mqtt from "mqtt";

const BROKER = "wss://maw-mqtt-bridge.laris.workers.dev/ws/mqtt";
const TOPIC = "maw/v1/hey/#";

export interface MqttMessage {
  from: string;
  to: string;
  timestamp: string;
  message: string;
  topic: string;
}

type MqttMessageHandler = (msg: MqttMessage) => void;

export function useMqtt(onMessage: MqttMessageHandler) {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const client = mqtt.connect(BROKER, {
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    client.on("connect", () => {
      console.log("[mqtt] connected to", BROKER);
      setConnected(true);
      client.subscribe(TOPIC, (err) => {
        if (err) console.error("[mqtt] subscribe error:", err);
        else console.log("[mqtt] subscribed to", TOPIC);
      });
    });

    client.on("close", () => setConnected(false));
    client.on("error", (err) => console.error("[mqtt] error:", err));

    client.on("message", (topic: string, payload: Buffer) => {
      try {
        const msg = JSON.parse(payload.toString());
        onMessageRef.current({
          from: msg.from || "",
          to: msg.to || "",
          timestamp: msg.timestamp || "",
          message: msg.message || "",
          topic,
        });
      } catch {}
    });

    return () => { client.end(); };
  }, []);

  return { connected };
}

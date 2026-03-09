import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { HaWsClient, type HaEvent } from "../src/ha/ws-client.js";

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("HaWsClient", () => {
  it("authenticates, subscribes event types, and emits events", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;

    const subscriptions: string[] = [];
    const events: HaEvent[] = [];

    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string; access_token?: string; event_type?: string };
        if (msg.type === "auth") {
          expect(msg.access_token).toBe("ha-token");
          socket.send(JSON.stringify({ type: "auth_ok" }));
          return;
        }
        if (msg.type === "subscribe_events" && msg.event_type) {
          subscriptions.push(msg.event_type);
          if (subscriptions.length === 2) {
            socket.send(
              JSON.stringify({
                type: "event",
                event: {
                  event_type: "notify_openclaw_direct",
                  time_fired: "2026-03-04T10:00:00Z",
                  data: { message: "ok" },
                },
              }),
            );
          }
        }
      });
    });

    const client = new HaWsClient({
      url: `ws://127.0.0.1:${port}/api/websocket`,
      token: "ha-token",
      eventTypes: ["notify_openclaw_direct", "notify_openclaw_agent"],
      reconnectInitialMs: 100,
      reconnectMaxMs: 1000,
      reconnectJitterRatio: 0,
      onEvent: async (event) => {
        events.push(event);
      },
    });

    await client.start();
    await waitFor(() => subscriptions.length === 2);
    await waitFor(() => events.length === 1);

    expect(subscriptions).toEqual(["notify_openclaw_direct", "notify_openclaw_agent"]);
    expect(events[0]?.event_type).toBe("notify_openclaw_direct");

    await client.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });
});

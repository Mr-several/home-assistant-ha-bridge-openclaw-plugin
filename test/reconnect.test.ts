import { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { HaWsClient } from "../src/ha/ws-client.js";

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("HaWsClient reconnect", () => {
  it("reconnects when reconnectNow is called", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;

    let connections = 0;
    wss.on("connection", (socket) => {
      connections += 1;
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "auth") {
          socket.send(JSON.stringify({ type: "auth_ok" }));
        }
      });
    });

    const client = new HaWsClient({
      url: `ws://127.0.0.1:${port}/api/websocket`,
      token: "ha-token",
      eventTypes: ["notify_openclaw_direct"],
      reconnectInitialMs: 50,
      reconnectMaxMs: 200,
      reconnectJitterRatio: 0,
      onEvent: async () => {},
    });

    await client.start();
    await waitFor(() => connections >= 1);

    client.reconnectNow();
    await waitFor(() => connections >= 2);

    expect(connections).toBeGreaterThanOrEqual(2);

    await client.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });
});

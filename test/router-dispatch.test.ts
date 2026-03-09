import fs from "node:fs/promises";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { HaBridgeService } from "../src/service/ha-bridge-service.js";

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function createSessionStore(entries: Record<string, unknown>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ha-bridge-test-"));
  const storePath = path.join(dir, "sessions.json");
  await fs.writeFile(storePath, JSON.stringify(entries), "utf8");
  return storePath;
}

describe("HaBridgeService routing and dispatch", () => {
  it("does not throw on start when required config is missing and reports details", async () => {
    const warn = vi.fn();
    const service = new HaBridgeService({
      rawConfig: {},
      runCommand: async () => ({
        code: 0,
        stdout: "",
        stderr: "",
        termination: "exit",
      }),
      logger: { warn },
    });

    await expect(service.start()).resolves.toBeUndefined();
    const status = service.getStatus();
    expect(status.running).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.missingRequired).toEqual(["haWsUrl", "haToken"]);
    expect(status.lastError).toContain("not configured");
    expect(status.lastError).toContain("missing required config");
    expect(warn).toHaveBeenCalledWith(
      "ha-bridge not configured; missing required config: haWsUrl, haToken",
    );
  });

  it("does not start when config is invalid and reports invalid reason", async () => {
    const warn = vi.fn();
    const service = new HaBridgeService({
      rawConfig: {
        haWsUrl: "http://ha.local:8123/api/websocket",
        haToken: "token",
        defaultChannel: "discord",
        defaultTarget: "channel:123",
      },
      runCommand: async () => ({
        code: 0,
        stdout: "",
        stderr: "",
        termination: "exit",
      }),
      logger: { warn },
    });

    await expect(service.start()).resolves.toBeUndefined();
    const status = service.getStatus();
    expect(status.running).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.missingRequired).toEqual([]);
    expect(status.lastError).toContain("not configured");
    expect(status.lastError).toContain("ws://");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid config"));
  });

  it("routes direct and agent events to expected command argv", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;

    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "auth") {
          socket.send(JSON.stringify({ type: "auth_ok" }));
        }
      });
    });

    const commandCalls: string[][] = [];
    const service = new HaBridgeService({
      rawConfig: {
        haWsUrl: `ws://127.0.0.1:${port}/api/websocket`,
        haToken: "ha-token",
        defaultChannel: "discord",
        defaultTarget: "channel:123",
        agentId: "main",
        agentSessionId: "ha-bridge",
      },
      gatewayConfig: {
        agents: {
          list: [
            { id: "dev", default: true },
            { id: "main", default: false },
          ],
        },
      },
      runCommand: async (argv) => {
        commandCalls.push(argv);
        return {
          code: 0,
          stdout: "ok",
          stderr: "",
          termination: "exit",
        };
      },
      logger: {},
    });

    await service.start();

    await service.ingestEventForTest({
      event_type: "notify_openclaw_direct",
      data: { message: "washer done" },
      time_fired: "2026-03-04T10:00:00Z",
    });

    await service.ingestEventForTest({
      event_type: "notify_openclaw_agent",
      data: { message: "door warning" },
      time_fired: "2026-03-04T10:01:00Z",
    });

    await waitFor(() => commandCalls.length >= 2);

    expect(commandCalls[0]).toEqual(
      expect.arrayContaining(["openclaw", "message", "send", "--channel", "discord", "--target", "channel:123"]),
    );

    expect(commandCalls[1]).toEqual(
      expect.arrayContaining([
        "openclaw",
        "agent",
        "--local",
        "--agent",
        "main",
        "--session-id",
        "ha-bridge",
        "--deliver",
        "--reply-channel",
        "discord",
        "--reply-to",
        "channel:123",
      ]),
    );

    await service.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });

  it("uses last-route fallback when channel/target are not configured", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;
    const sessionStorePath = await createSessionStore({
      "agent:main:main": {
        lastChannel: "discord",
        lastTo: "channel:999",
      },
    });

    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "auth") {
          socket.send(JSON.stringify({ type: "auth_ok" }));
        }
      });
    });

    const commandCalls: string[][] = [];
    const service = new HaBridgeService({
      rawConfig: {
        haWsUrl: `ws://127.0.0.1:${port}/api/websocket`,
        haToken: "ha-token",
        agentId: "main",
        agentSessionId: "ha-bridge",
      },
      gatewayConfig: {
        session: {
          store: sessionStorePath,
        },
      },
      runCommand: async (argv) => {
        commandCalls.push(argv);
        return {
          code: 0,
          stdout: "ok",
          stderr: "",
          termination: "exit",
        };
      },
      logger: {},
    });

    await service.start();

    await service.ingestEventForTest({
      event_type: "notify_openclaw_direct",
      data: { message: "washer done" },
      time_fired: "2026-03-04T10:00:00Z",
    });

    await service.ingestEventForTest({
      event_type: "notify_openclaw_agent",
      data: { message: "door warning" },
      time_fired: "2026-03-04T10:01:00Z",
    });

    await waitFor(() => commandCalls.length >= 2);

    expect(commandCalls[0]).toEqual(
      expect.arrayContaining([
        "openclaw",
        "message",
        "send",
        "--channel",
        "discord",
        "--target",
        "channel:999",
      ]),
    );

    expect(commandCalls[1]).toEqual(
      expect.arrayContaining([
        "openclaw",
        "agent",
        "--local",
        "--agent",
        "main",
        "--session-id",
        "ha-bridge",
        "--deliver",
      ]),
    );
    expect(commandCalls[1]).not.toContain("--reply-channel");
    expect(commandCalls[1]).not.toContain("--reply-to");

    await service.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });

  it("detects default agentId when agentId is not configured", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;

    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "auth") {
          socket.send(JSON.stringify({ type: "auth_ok" }));
        }
      });
    });

    const commandCalls: string[][] = [];
    const service = new HaBridgeService({
      rawConfig: {
        haWsUrl: `ws://127.0.0.1:${port}/api/websocket`,
        haToken: "ha-token",
        agentSessionId: "ha-bridge",
      },
      gatewayConfig: {
        agents: {
          list: [
            { id: "dev", default: true },
            { id: "main", default: false },
          ],
        },
      },
      runCommand: async (argv) => {
        commandCalls.push(argv);
        return {
          code: 0,
          stdout: "ok",
          stderr: "",
          termination: "exit",
        };
      },
      logger: {},
    });

    await service.start();

    await service.ingestEventForTest({
      event_type: "notify_openclaw_agent",
      data: { message: "no-agent-id" },
      time_fired: "2026-03-04T10:01:00Z",
    });

    await waitFor(() => commandCalls.length >= 1);
    expect(commandCalls[0]).toEqual(expect.arrayContaining(["openclaw", "agent", "--local"]));
    expect(commandCalls[0]).toEqual(expect.arrayContaining(["--agent", "dev"]));

    await service.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });

  it('falls back to "main" when agentId is not configured and detection fails', async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;

    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "auth") {
          socket.send(JSON.stringify({ type: "auth_ok" }));
        }
      });
    });

    const commandCalls: string[][] = [];
    const service = new HaBridgeService({
      rawConfig: {
        haWsUrl: `ws://127.0.0.1:${port}/api/websocket`,
        haToken: "ha-token",
        agentSessionId: "ha-bridge",
      },
      gatewayConfig: {
        agents: {
          list: [],
        },
      },
      runCommand: async (argv) => {
        commandCalls.push(argv);
        return {
          code: 0,
          stdout: "ok",
          stderr: "",
          termination: "exit",
        };
      },
      logger: {},
    });

    await service.start();

    await service.ingestEventForTest({
      event_type: "notify_openclaw_agent",
      data: { message: "fallback-main" },
      time_fired: "2026-03-04T10:01:00Z",
    });

    await waitFor(() => commandCalls.length >= 1);
    expect(commandCalls[0]).toEqual(expect.arrayContaining(["openclaw", "agent", "--local"]));
    expect(commandCalls[0]).toEqual(expect.arrayContaining(["--agent", "main"]));

    await service.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });

  it("retries with default agent when configured agentId is invalid", async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;

    wss.on("connection", (socket) => {
      socket.send(JSON.stringify({ type: "auth_required" }));
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === "auth") {
          socket.send(JSON.stringify({ type: "auth_ok" }));
        }
      });
    });

    const warn = vi.fn();
    const commandCalls: string[][] = [];
    const service = new HaBridgeService({
      rawConfig: {
        haWsUrl: `ws://127.0.0.1:${port}/api/websocket`,
        haToken: "ha-token",
        agentId: "not-exist",
        agentSessionId: "ha-bridge",
      },
      runCommand: async (argv) => {
        commandCalls.push(argv);
        if (argv.includes("--agent")) {
          return {
            code: 1,
            stdout: "",
            stderr: 'Error: Unknown agent id "not-exist".',
            termination: "exit",
          };
        }
        return {
          code: 0,
          stdout: "ok",
          stderr: "",
          termination: "exit",
        };
      },
      logger: { warn },
    });

    await service.start();

    await service.ingestEventForTest({
      event_type: "notify_openclaw_agent",
      data: { message: "retry-default-agent" },
      time_fired: "2026-03-04T10:01:00Z",
    });

    await waitFor(() => commandCalls.length >= 2);
    expect(commandCalls[0]).toContain("--agent");
    expect(commandCalls[1]).not.toContain("--agent");
    expect(warn).toHaveBeenCalledWith(
      'ha-bridge agentId "not-exist" is invalid; retrying with default agent',
    );

    await service.stop();
    await new Promise<void>((resolve, reject) => wss.close((err) => (err ? reject(err) : resolve())));
  });
});

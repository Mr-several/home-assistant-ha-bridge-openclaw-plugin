import { describe, expect, it } from "vitest";
import { getMissingRequired, parseHaBridgeConfig } from "../src/config.js";

describe("parseHaBridgeConfig", () => {
  it("reports missing required keys", () => {
    expect(getMissingRequired({})).toEqual(["haWsUrl", "haToken"]);

    expect(
      getMissingRequired({
        haWsUrl: "ws://ha.local:8123/api/websocket",
        haToken: "token",
      }),
    ).toEqual([]);
  });

  it("parses valid config and applies defaults", () => {
    const cfg = parseHaBridgeConfig({
      haWsUrl: "ws://ha.local:8123/api/websocket",
      haToken: "token",
    });

    expect(cfg.directEventType).toBe("notify_openclaw_direct");
    expect(cfg.agentEventType).toBe("notify_openclaw_agent");
    expect(cfg.thinking).toBe("low");
    expect(cfg.defaultChannel).toBeUndefined();
    expect(cfg.defaultTarget).toBeUndefined();
    expect(cfg.agentId).toBeUndefined();
  });

  it("throws when required keys are missing", () => {
    expect(() =>
      parseHaBridgeConfig({
        haWsUrl: "ws://ha.local:8123/api/websocket",
      }),
    ).toThrow(/haToken/);
  });

  it("throws when ws url is not websocket", () => {
    expect(() =>
      parseHaBridgeConfig({
        haWsUrl: "http://ha.local:8123/api/websocket",
        haToken: "token",
      }),
    ).toThrow(/ws:\/\//);
  });

  it("throws when route channel/target are not set together", () => {
    expect(() =>
      parseHaBridgeConfig({
        haWsUrl: "ws://ha.local:8123/api/websocket",
        haToken: "token",
        defaultChannel: "discord",
      }),
    ).toThrow(/defaultChannel\/defaultTarget/);
  });
});

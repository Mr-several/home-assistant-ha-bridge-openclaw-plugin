import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHaBridgeCli } from "../src/cli/register-cli.js";

describe("ha-bridge cli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints status payload", async () => {
    const program = new Command();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    registerHaBridgeCli({
      program,
      getService: () =>
        ({
          getStatus: () => ({
            running: true,
            connected: true,
            configured: true,
            missingRequired: [],
            reconnectAttempts: 0,
            queueDepth: 0,
            subscribedEventTypes: [],
          }),
        }) as any,
    });

    await program.parseAsync(["ha-bridge", "status", "--json"], { from: "user" });

    expect(logSpy).toHaveBeenCalled();
    expect(String(logSpy.mock.calls[0]?.[0])).toContain("running");
  });

  it("prints warning details in status text mode when not configured", async () => {
    const program = new Command();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    registerHaBridgeCli({
      program,
      getService: () =>
        ({
          getStatus: () => ({
            running: false,
            connected: false,
            configured: false,
            missingRequired: ["haWsUrl", "haToken"],
            reconnectAttempts: 0,
            queueDepth: 0,
            subscribedEventTypes: [],
            lastError: "not configured: missing required config: haWsUrl, haToken",
          }),
        }) as any,
    });

    await program.parseAsync(["ha-bridge", "status"], { from: "user" });

    const output = String(logSpy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("configured: false");
    expect(output).toContain("missingRequired: haWsUrl, haToken");
    expect(output).toContain("warning: not configured:");
  });

  it("invokes reconnect", async () => {
    const program = new Command();
    const reconnect = vi.fn(async () => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    registerHaBridgeCli({
      program,
      getService: () =>
        ({
          reconnect,
          getStatus: () => ({ running: true }),
        }) as any,
    });

    await program.parseAsync(["ha-bridge", "reconnect"], { from: "user" });

    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalled();
  });
});

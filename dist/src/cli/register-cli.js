function print(value, asJson) {
    if (asJson) {
        console.log(JSON.stringify(value, null, 2));
        return;
    }
    if (typeof value === "string") {
        console.log(value);
        return;
    }
    console.log(JSON.stringify(value, null, 2));
}
function formatStatusForText(status) {
    const lines = [
        `running: ${status.running}`,
        `connected: ${status.connected}`,
        `configured: ${status.configured}`,
    ];
    if (!status.configured) {
        if (status.missingRequired.length > 0) {
            lines.push(`missingRequired: ${status.missingRequired.join(", ")}`);
        }
        if (status.lastError) {
            lines.push(`warning: ${status.lastError}`);
        }
    }
    else {
        if (status.haWsUrl) {
            lines.push(`haWsUrl: ${status.haWsUrl}`);
        }
        lines.push(`queueDepth: ${status.queueDepth}`);
        lines.push(`reconnectAttempts: ${status.reconnectAttempts}`);
    }
    return lines.join("\n");
}
export function registerHaBridgeCli(params) {
    const root = params.program.command("ha-bridge").description("Home Assistant bridge operations");
    root
        .command("status")
        .description("Show HA bridge runtime status")
        .option("--json", "Print JSON output", false)
        .action((opts) => {
        const service = params.getService();
        const status = service?.getStatus() ?? {
            running: false,
            connected: false,
            configured: false,
            missingRequired: [],
            reconnectAttempts: 0,
            queueDepth: 0,
            subscribedEventTypes: [],
        };
        if (opts.json) {
            print(status, true);
            return;
        }
        print(formatStatusForText(status), false);
    });
    root
        .command("reconnect")
        .description("Reconnect HA websocket")
        .action(async () => {
        const service = params.getService();
        if (!service) {
            throw new Error("ha-bridge service is not running");
        }
        await service.reconnect();
        print({ ok: true }, true);
    });
    root
        .command("dry-run")
        .description("Build dispatch command args without sending")
        .requiredOption("--mode <mode>", "direct or agent")
        .requiredOption("--message <text>", "message text")
        .option("--json", "Print JSON output", false)
        .action((opts) => {
        const service = params.getService();
        if (!service) {
            throw new Error("ha-bridge service is not running");
        }
        const mode = opts.mode.trim().toLowerCase();
        if (mode !== "direct" && mode !== "agent") {
            throw new Error("--mode must be direct or agent");
        }
        const result = service.dryRun({
            mode,
            message: opts.message,
        });
        print(result, Boolean(opts.json));
    });
}

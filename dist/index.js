import { registerHaBridgeCli } from "./src/cli/register-cli.js";
import { HaBridgeService } from "./src/service/ha-bridge-service.js";
const plugin = {
    id: "ha-bridge",
    name: "Home Assistant Bridge",
    description: "Bridge Home Assistant websocket events to OpenClaw message and agent delivery",
    register(api) {
        let service = null;
        const serviceDef = {
            id: "ha-bridge",
            start: async (ctx) => {
                service = new HaBridgeService({
                    rawConfig: api.pluginConfig,
                    gatewayConfig: ctx.config,
                    runCommand: async (argv, options) => {
                        const result = await api.runtime.system.runCommandWithTimeout(argv, {
                            timeoutMs: options.timeoutMs,
                        });
                        return {
                            code: result.code,
                            stdout: result.stdout,
                            stderr: result.stderr,
                            termination: result.termination,
                        };
                    },
                    logger: api.logger,
                });
                await service.start();
            },
            stop: async () => {
                await service?.stop();
                service = null;
            },
        };
        api.registerService(serviceDef);
        api.registerCli(({ program }) => {
            registerHaBridgeCli({
                program,
                getService: () => service,
            });
        }, { commands: ["ha-bridge"] });
    },
};
export default plugin;

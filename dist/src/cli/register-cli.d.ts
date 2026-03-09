import type { Command } from "commander";
import type { HaBridgeService } from "../service/ha-bridge-service.js";
type CliParams = {
    program: Command;
    getService: () => HaBridgeService | null;
};
export declare function registerHaBridgeCli(params: CliParams): void;
export {};

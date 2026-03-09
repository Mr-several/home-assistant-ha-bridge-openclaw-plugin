import { type CommandRunner } from "../dispatch/command-dispatcher.js";
import { type HaEvent, type HaWsClientLogger } from "../ha/ws-client.js";
import { type HaBridgeStatus } from "../state/runtime-state.js";
type ServiceLogger = HaWsClientLogger;
export type HaBridgeServiceDeps = {
    rawConfig: unknown;
    gatewayConfig?: unknown;
    runCommand: CommandRunner;
    logger: ServiceLogger;
    random?: () => number;
};
export type DryRunResult = {
    mode: "direct" | "agent";
    argv: string[];
};
export declare class HaBridgeService {
    private readonly deps;
    private config;
    private effectiveAgentId;
    private state;
    private deduper;
    private limiter;
    private queue;
    private dispatcher;
    private wsClient;
    constructor(deps: HaBridgeServiceDeps);
    start(): Promise<void>;
    stop(): Promise<void>;
    reconnect(): Promise<void>;
    getStatus(): HaBridgeStatus;
    dryRun(params: {
        mode: "direct" | "agent";
        message: string;
    }): DryRunResult;
    ingestEventForTest(event: HaEvent): Promise<void>;
    private onInboundEvent;
    private consumeEvent;
    private resolveRoute;
    private dispatchDirectViaLastRoute;
    private dispatchAgentWithFallback;
    private isUnknownAgentError;
    private resolveLastDirectRoute;
    private resolveEffectiveAgent;
    private toRoute;
    private buildDryRunEvent;
    private resolveDispatchMode;
    private requireConfig;
    private requireDeduper;
    private requireLimiter;
    private requireQueue;
    private requireDispatcher;
}
export {};

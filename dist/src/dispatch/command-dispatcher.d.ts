import type { ThinkingLevel } from "../config.js";
export type CommandRunnerResult = {
    code: number | null;
    stdout: string;
    stderr: string;
    termination: string;
};
export type CommandRunner = (argv: string[], options: {
    timeoutMs: number;
}) => Promise<CommandRunnerResult>;
export type DispatchResult = {
    ok: boolean;
    argv: string[];
    code: number | null;
    stdout: string;
    stderr: string;
    error?: string;
};
export declare class CommandDispatcher {
    private readonly runCommand;
    private readonly commandTimeoutMs;
    constructor(runCommand: CommandRunner, commandTimeoutMs: number);
    buildDirectArgs(params: {
        channel: string;
        target: string;
        message: string;
    }): string[];
    buildAgentArgs(params: {
        agentId?: string;
        sessionId: string;
        prompt: string;
        channel?: string;
        target?: string;
        thinking: ThinkingLevel;
    }): string[];
    dispatchDirect(params: {
        channel: string;
        target: string;
        message: string;
    }): Promise<DispatchResult>;
    dispatchAgent(params: {
        agentId?: string;
        sessionId: string;
        prompt: string;
        channel?: string;
        target?: string;
        thinking: ThinkingLevel;
    }): Promise<DispatchResult>;
    private execute;
}

function truncate(value, maxChars) {
    if (value.length <= maxChars) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
function summarizeFailure(result) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const signal = result.termination !== "exit" ? ` (${result.termination})` : "";
    if (stderr) {
        return `exit=${result.code}${signal} stderr=${truncate(stderr, 400)}`;
    }
    if (stdout) {
        return `exit=${result.code}${signal} stdout=${truncate(stdout, 400)}`;
    }
    return `exit=${result.code}${signal}`;
}
export class CommandDispatcher {
    runCommand;
    commandTimeoutMs;
    constructor(runCommand, commandTimeoutMs) {
        this.runCommand = runCommand;
        this.commandTimeoutMs = commandTimeoutMs;
    }
    buildDirectArgs(params) {
        return [
            "openclaw",
            "message",
            "send",
            "--channel",
            params.channel,
            "--target",
            params.target,
            "--message",
            params.message,
            "--json",
        ];
    }
    buildAgentArgs(params) {
        const argv = [
            "openclaw",
            "agent",
            "--local",
            "--session-id",
            params.sessionId,
            "--message",
            params.prompt,
            "--thinking",
            params.thinking,
            "--deliver",
            "--json",
        ];
        const hasChannel = Boolean(params.channel);
        const hasTarget = Boolean(params.target);
        if (hasChannel !== hasTarget) {
            throw new Error("agent delivery route requires both channel and target");
        }
        if (hasChannel && hasTarget) {
            argv.splice(argv.length - 1, 0, "--reply-channel", params.channel, "--reply-to", params.target);
        }
        if (params.agentId) {
            argv.splice(3, 0, "--agent", params.agentId);
        }
        return argv;
    }
    async dispatchDirect(params) {
        const argv = this.buildDirectArgs(params);
        return this.execute(argv);
    }
    async dispatchAgent(params) {
        const argv = this.buildAgentArgs(params);
        return this.execute(argv);
    }
    async execute(argv) {
        const result = await this.runCommand(argv, {
            timeoutMs: this.commandTimeoutMs,
        });
        if (result.code === 0) {
            return {
                ok: true,
                argv,
                code: result.code,
                stdout: result.stdout,
                stderr: result.stderr,
            };
        }
        return {
            ok: false,
            argv,
            code: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
            error: summarizeFailure(result),
        };
    }
}

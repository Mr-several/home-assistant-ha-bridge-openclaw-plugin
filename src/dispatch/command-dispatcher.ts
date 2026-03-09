import type { ThinkingLevel } from "../config.js";

export type CommandRunnerResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  termination: string;
};

export type CommandRunner = (
  argv: string[],
  options: { timeoutMs: number },
) => Promise<CommandRunnerResult>;

export type DispatchResult = {
  ok: boolean;
  argv: string[];
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
};

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function summarizeFailure(result: CommandRunnerResult): string {
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
  constructor(
    private readonly runCommand: CommandRunner,
    private readonly commandTimeoutMs: number,
  ) {}

  buildDirectArgs(params: {
    channel: string;
    target: string;
    message: string;
  }): string[] {
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

  buildAgentArgs(params: {
    agentId?: string;
    sessionId: string;
    prompt: string;
    channel?: string;
    target?: string;
    thinking: ThinkingLevel;
  }): string[] {
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
      argv.splice(argv.length - 1, 0, "--reply-channel", params.channel!, "--reply-to", params.target!);
    }
    if (params.agentId) {
      argv.splice(3, 0, "--agent", params.agentId);
    }

    return argv;
  }

  async dispatchDirect(params: {
    channel: string;
    target: string;
    message: string;
  }): Promise<DispatchResult> {
    const argv = this.buildDirectArgs(params);
    return this.execute(argv);
  }

  async dispatchAgent(params: {
    agentId?: string;
    sessionId: string;
    prompt: string;
    channel?: string;
    target?: string;
    thinking: ThinkingLevel;
  }): Promise<DispatchResult> {
    const argv = this.buildAgentArgs(params);
    return this.execute(argv);
  }

  private async execute(argv: string[]): Promise<DispatchResult> {
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

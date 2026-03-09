declare module "openclaw/plugin-sdk" {
  export type OpenClawPluginServiceContext = {
    config: Record<string, unknown>;
    workspaceDir?: string;
    stateDir: string;
    logger: {
      debug?: (message: string) => void;
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
  };

  export type OpenClawPluginService = {
    id: string;
    start: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
    stop?: (ctx: OpenClawPluginServiceContext) => void | Promise<void>;
  };

  export type OpenClawPluginApi = {
    pluginConfig?: Record<string, unknown>;
    logger: {
      debug?: (message: string) => void;
      info: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
    runtime: {
      system: {
        runCommandWithTimeout: (
          argv: string[],
          options: { timeoutMs: number },
        ) => Promise<{
          code: number | null;
          stdout: string;
          stderr: string;
          termination: string;
        }>;
      };
    };
    registerService: (service: OpenClawPluginService) => void;
    registerCli: (
      registrar: (ctx: { program: import("commander").Command }) => void | Promise<void>,
      opts?: { commands?: string[] },
    ) => void;
  };
}

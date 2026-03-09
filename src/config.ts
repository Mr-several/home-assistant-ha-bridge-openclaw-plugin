export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type LogLevel = "error" | "warn" | "info" | "debug";

export type HaBridgeConfig = {
  haWsUrl: string;
  haToken: string;
  defaultChannel?: string;
  defaultTarget?: string;
  directEventType: string;
  agentEventType: string;
  directChannel?: string;
  directTarget?: string;
  agentChannel?: string;
  agentTarget?: string;
  directMessageTemplate: string;
  agentPromptTemplate: string;
  agentId?: string;
  agentSessionId: string;
  thinking: ThinkingLevel;
  dedupeWindowMs: number;
  maxMessagesPerMinute: number;
  queueMax: number;
  commandTimeoutMs: number;
  reconnectInitialMs: number;
  reconnectMaxMs: number;
  reconnectJitterRatio: number;
  logLevel: LogLevel;
};

const DEFAULT_DIRECT_EVENT_TYPE = "notify_openclaw_direct";
const DEFAULT_AGENT_EVENT_TYPE = "notify_openclaw_agent";
const DEFAULT_DIRECT_TEMPLATE = "[HA] {{event_type}}: {{message}}";
const DEFAULT_AGENT_TEMPLATE =
  "请把下面这条 Home Assistant 事件整理成一条简洁、自然、适合直接发给用户的提醒：\\n事件类型：{{event_type}}\\n事件时间：{{time_fired}}\\n事件内容：{{message}}";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const REQUIRED_CONFIG_KEYS = ["haWsUrl", "haToken"] as const;

export function getMissingRequired(input: unknown): string[] {
  const raw = asRecord(input);
  const missing: string[] = [];

  for (const key of REQUIRED_CONFIG_KEYS) {
    const value = raw[key];
    if (typeof value !== "string" || !value.trim()) {
      missing.push(key);
    }
  }

  return missing;
}

function readRequiredString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value.trim();
}

function assertRoutePair(
  channel: string | undefined,
  target: string | undefined,
  label: string,
): void {
  const hasChannel = Boolean(channel);
  const hasTarget = Boolean(target);
  if (hasChannel === hasTarget) {
    return;
  }
  throw new Error(`Config ${label} must set both channel and target together`);
}

function readOptionalString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Config ${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readInt(raw: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw[key];
  if (value == null) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Config ${key} must be a finite number`);
  }
  return Math.floor(value);
}

function readFloat(raw: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw[key];
  if (value == null) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Config ${key} must be a finite number`);
  }
  return value;
}

function readThinking(raw: Record<string, unknown>): ThinkingLevel {
  const value = raw.thinking;
  if (value == null) {
    return "low";
  }
  if (typeof value !== "string") {
    throw new Error("Config thinking must be a string");
  }
  const normalized = value.trim().toLowerCase();
  const allowed: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  if (!allowed.includes(normalized as ThinkingLevel)) {
    throw new Error(`Invalid thinking: ${value}`);
  }
  return normalized as ThinkingLevel;
}

function readLogLevel(raw: Record<string, unknown>): LogLevel {
  const value = raw.logLevel;
  if (value == null) {
    return "info";
  }
  if (typeof value !== "string") {
    throw new Error("Config logLevel must be a string");
  }
  const normalized = value.trim().toLowerCase();
  const allowed: LogLevel[] = ["error", "warn", "info", "debug"];
  if (!allowed.includes(normalized as LogLevel)) {
    throw new Error(`Invalid logLevel: ${value}`);
  }
  return normalized as LogLevel;
}

function validateWsUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("haWsUrl must be a valid URL");
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("haWsUrl must use ws:// or wss://");
  }
  if (!url.pathname.endsWith("/api/websocket")) {
    throw new Error("haWsUrl must end with /api/websocket");
  }
}

export function parseHaBridgeConfig(input: unknown): HaBridgeConfig {
  const raw = asRecord(input);

  const cfg: HaBridgeConfig = {
    haWsUrl: readRequiredString(raw, "haWsUrl"),
    haToken: readRequiredString(raw, "haToken"),
    defaultChannel: readOptionalString(raw, "defaultChannel"),
    defaultTarget: readOptionalString(raw, "defaultTarget"),
    directEventType: readOptionalString(raw, "directEventType") ?? DEFAULT_DIRECT_EVENT_TYPE,
    agentEventType: readOptionalString(raw, "agentEventType") ?? DEFAULT_AGENT_EVENT_TYPE,
    directChannel: readOptionalString(raw, "directChannel"),
    directTarget: readOptionalString(raw, "directTarget"),
    agentChannel: readOptionalString(raw, "agentChannel"),
    agentTarget: readOptionalString(raw, "agentTarget"),
    directMessageTemplate: readOptionalString(raw, "directMessageTemplate") ?? DEFAULT_DIRECT_TEMPLATE,
    agentPromptTemplate: readOptionalString(raw, "agentPromptTemplate") ?? DEFAULT_AGENT_TEMPLATE,
    agentId: readOptionalString(raw, "agentId"),
    agentSessionId: readOptionalString(raw, "agentSessionId") ?? "ha-bridge",
    thinking: readThinking(raw),
    dedupeWindowMs: readInt(raw, "dedupeWindowMs", 5000),
    maxMessagesPerMinute: readInt(raw, "maxMessagesPerMinute", 30),
    queueMax: readInt(raw, "queueMax", 200),
    commandTimeoutMs: readInt(raw, "commandTimeoutMs", 45_000),
    reconnectInitialMs: readInt(raw, "reconnectInitialMs", 2000),
    reconnectMaxMs: readInt(raw, "reconnectMaxMs", 60_000),
    reconnectJitterRatio: readFloat(raw, "reconnectJitterRatio", 0.2),
    logLevel: readLogLevel(raw),
  };

  validateWsUrl(cfg.haWsUrl);
  assertRoutePair(cfg.defaultChannel, cfg.defaultTarget, "defaultChannel/defaultTarget");
  assertRoutePair(cfg.directChannel, cfg.directTarget, "directChannel/directTarget");
  assertRoutePair(cfg.agentChannel, cfg.agentTarget, "agentChannel/agentTarget");

  if (cfg.dedupeWindowMs < 0) {
    throw new Error("dedupeWindowMs must be >= 0");
  }
  if (cfg.maxMessagesPerMinute < 1) {
    throw new Error("maxMessagesPerMinute must be >= 1");
  }
  if (cfg.queueMax < 1) {
    throw new Error("queueMax must be >= 1");
  }
  if (cfg.commandTimeoutMs < 1000) {
    throw new Error("commandTimeoutMs must be >= 1000");
  }
  if (cfg.reconnectInitialMs < 100) {
    throw new Error("reconnectInitialMs must be >= 100");
  }
  if (cfg.reconnectMaxMs < cfg.reconnectInitialMs) {
    throw new Error("reconnectMaxMs must be >= reconnectInitialMs");
  }
  if (cfg.reconnectJitterRatio < 0 || cfg.reconnectJitterRatio > 1) {
    throw new Error("reconnectJitterRatio must be between 0 and 1");
  }

  return cfg;
}

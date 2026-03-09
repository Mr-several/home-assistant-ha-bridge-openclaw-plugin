import type { HaEvent } from "../ha/ws-client.js";

const DEFAULT_MAX_MESSAGE_CHARS = 2000;

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export type TemplateContext = {
  event_type: string;
  time_fired: string;
  message: string;
  title: string;
  severity: string;
  data_json: string;
};

export function extractEventMessage(event: HaEvent, maxChars = DEFAULT_MAX_MESSAGE_CHARS): string {
  const data = event.data ?? {};
  const message = asString(data.message);
  if (message) {
    return truncate(message, maxChars);
  }

  const title = asString(data.title);
  if (title) {
    return truncate(title, maxChars);
  }

  return truncate(safeJson(data), maxChars);
}

export function buildTemplateContext(
  event: HaEvent,
  maxChars = DEFAULT_MAX_MESSAGE_CHARS,
): TemplateContext {
  const data = event.data ?? {};
  return {
    event_type: event.event_type,
    time_fired: typeof event.time_fired === "string" ? event.time_fired : "",
    message: extractEventMessage(event, maxChars),
    title: asString(data.title) ?? "",
    severity: asString(data.severity) ?? "",
    data_json: truncate(safeJson(data), maxChars),
  };
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_full, key: keyof TemplateContext) => {
    const value = context[key];
    return typeof value === "string" ? value : "";
  });
}

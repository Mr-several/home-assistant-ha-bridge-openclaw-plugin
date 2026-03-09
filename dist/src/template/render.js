const DEFAULT_MAX_MESSAGE_CHARS = 2000;
function truncate(value, maxChars) {
    if (value.length <= maxChars) {
        return value;
    }
    return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
function safeJson(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return "[unserializable]";
    }
}
function asString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}
export function extractEventMessage(event, maxChars = DEFAULT_MAX_MESSAGE_CHARS) {
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
export function buildTemplateContext(event, maxChars = DEFAULT_MAX_MESSAGE_CHARS) {
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
export function renderTemplate(template, context) {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_full, key) => {
        const value = context[key];
        return typeof value === "string" ? value : "";
    });
}

import WebSocket from "ws";
export class HaWsClient {
    options;
    ws = null;
    stopped = false;
    reconnectTimer = null;
    nextId = 1;
    reconnectDelayMs;
    reconnectAttempts = 0;
    constructor(options) {
        this.options = options;
        this.reconnectDelayMs = options.reconnectInitialMs;
    }
    async start() {
        this.stopped = false;
        this.clearReconnectTimer();
        this.connect();
    }
    async stop() {
        this.stopped = true;
        this.clearReconnectTimer();
        const ws = this.ws;
        this.ws = null;
        if (ws) {
            ws.once("error", () => {
                // swallow shutdown-time transport errors
            });
            try {
                if (ws.readyState !== WebSocket.CLOSED) {
                    ws.close();
                }
            }
            catch {
                // ignore close races during shutdown
            }
        }
        this.options.onConnectionChange?.(false);
    }
    reconnectNow() {
        this.reconnectDelayMs = this.options.reconnectInitialMs;
        this.reconnectAttempts = 0;
        this.options.onReconnectAttempt?.(this.reconnectAttempts);
        const ws = this.ws;
        if (ws) {
            ws.close();
            return;
        }
        this.scheduleReconnect(0);
    }
    connect() {
        if (this.stopped) {
            return;
        }
        const WsCtor = this.options.wsCtor ?? WebSocket;
        const ws = new WsCtor(this.options.url);
        this.ws = ws;
        ws.on("open", () => {
            this.options.logger?.debug?.("ha-bridge: websocket opened");
        });
        ws.on("message", (buffer) => {
            void this.handleMessage(buffer);
        });
        ws.on("close", () => {
            this.options.onConnectionChange?.(false);
            this.ws = null;
            if (!this.stopped) {
                this.scheduleReconnect();
            }
        });
        ws.on("error", (error) => {
            this.options.onError?.(error.message);
            this.options.logger?.warn?.(`ha-bridge: websocket error: ${error.message}`);
        });
    }
    async handleMessage(buffer) {
        let message;
        try {
            message = JSON.parse(buffer.toString());
        }
        catch {
            this.options.onError?.("invalid websocket json payload");
            return;
        }
        if (message.type === "auth_required") {
            this.send({
                type: "auth",
                access_token: this.options.token,
            });
            return;
        }
        if (message.type === "auth_ok") {
            this.reconnectDelayMs = this.options.reconnectInitialMs;
            this.reconnectAttempts = 0;
            this.options.onReconnectAttempt?.(this.reconnectAttempts);
            this.options.onConnectionChange?.(true);
            for (const eventType of this.options.eventTypes) {
                this.send({
                    id: this.nextId++,
                    type: "subscribe_events",
                    event_type: eventType,
                });
            }
            return;
        }
        if (message.type === "auth_invalid") {
            this.options.onError?.("home assistant auth_invalid");
            this.options.onConnectionChange?.(false);
            this.ws?.close();
            return;
        }
        if (message.type === "event" && message.event?.event_type) {
            await this.options.onEvent(message.event);
        }
    }
    send(payload) {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }
        ws.send(JSON.stringify(payload));
    }
    scheduleReconnect(delayOverrideMs) {
        if (this.stopped || this.reconnectTimer) {
            return;
        }
        const baseDelay = delayOverrideMs ?? this.reconnectDelayMs;
        const ratio = this.options.reconnectJitterRatio;
        const random = this.options.random ?? Math.random;
        const jitter = baseDelay * ratio * (random() * 2 - 1);
        const delay = Math.max(0, Math.floor(baseDelay + jitter));
        this.reconnectAttempts += 1;
        this.options.onReconnectAttempt?.(this.reconnectAttempts);
        this.reconnectTimer = setTimeout(() => {
            this.clearReconnectTimer();
            this.connect();
        }, delay);
        this.reconnectDelayMs = Math.min(this.options.reconnectMaxMs, baseDelay * 2);
    }
    clearReconnectTimer() {
        if (!this.reconnectTimer) {
            return;
        }
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }
}

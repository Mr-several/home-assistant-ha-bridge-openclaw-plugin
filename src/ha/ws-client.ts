import WebSocket from "ws";

export type HaEvent = {
  event_type: string;
  data?: Record<string, unknown>;
  time_fired?: string;
  origin?: string;
};

export type HaWsClientLogger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export type HaWsClientOptions = {
  url: string;
  token: string;
  eventTypes: string[];
  reconnectInitialMs: number;
  reconnectMaxMs: number;
  reconnectJitterRatio: number;
  logger?: HaWsClientLogger;
  onEvent: (event: HaEvent) => void | Promise<void>;
  onConnectionChange?: (connected: boolean) => void;
  onReconnectAttempt?: (attempts: number) => void;
  onError?: (error: string) => void;
  random?: () => number;
  wsCtor?: typeof WebSocket;
};

type HaInboundMessage = {
  type?: string;
  event?: HaEvent;
};

export class HaWsClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private reconnectDelayMs: number;
  private reconnectAttempts = 0;

  constructor(private readonly options: HaWsClientOptions) {
    this.reconnectDelayMs = options.reconnectInitialMs;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.clearReconnectTimer();
    this.connect();
  }

  async stop(): Promise<void> {
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
      } catch {
        // ignore close races during shutdown
      }
    }
    this.options.onConnectionChange?.(false);
  }

  reconnectNow(): void {
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

  private connect() {
    if (this.stopped) {
      return;
    }

    const WsCtor = this.options.wsCtor ?? WebSocket;
    const ws = new WsCtor(this.options.url);
    this.ws = ws;

    ws.on("open", () => {
      this.options.logger?.debug?.("ha-bridge: websocket opened");
    });

    ws.on("message", (buffer: WebSocket.RawData) => {
      void this.handleMessage(buffer);
    });

    ws.on("close", () => {
      this.options.onConnectionChange?.(false);
      this.ws = null;
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    ws.on("error", (error: Error) => {
      this.options.onError?.(error.message);
      this.options.logger?.warn?.(`ha-bridge: websocket error: ${error.message}`);
    });
  }

  private async handleMessage(buffer: WebSocket.RawData): Promise<void> {
    let message: HaInboundMessage;
    try {
      message = JSON.parse(buffer.toString()) as HaInboundMessage;
    } catch {
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

  private send(payload: Record<string, unknown>) {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify(payload));
  }

  private scheduleReconnect(delayOverrideMs?: number) {
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

  private clearReconnectTimer() {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

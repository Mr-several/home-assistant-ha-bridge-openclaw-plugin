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
export declare class HaWsClient {
    private readonly options;
    private ws;
    private stopped;
    private reconnectTimer;
    private nextId;
    private reconnectDelayMs;
    private reconnectAttempts;
    constructor(options: HaWsClientOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    reconnectNow(): void;
    private connect;
    private handleMessage;
    private send;
    private scheduleReconnect;
    private clearReconnectTimer;
}

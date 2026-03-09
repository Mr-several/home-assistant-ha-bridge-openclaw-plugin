export type DispatchMode = "direct_message" | "agent_rewrite";
export type HaBridgeStatus = {
    running: boolean;
    connected: boolean;
    configured: boolean;
    missingRequired: string[];
    reconnectAttempts: number;
    queueDepth: number;
    haWsUrl?: string;
    subscribedEventTypes: string[];
    lastEventType?: string;
    lastEventTime?: string;
    lastDispatchMode?: DispatchMode;
    lastDispatchStatus?: string;
    lastError?: string;
};
export declare class RuntimeState {
    private status;
    constructor(seed?: Partial<HaBridgeStatus>);
    setRunning(running: boolean): void;
    setConnected(connected: boolean): void;
    setConfigured(configured: boolean): void;
    setMissingRequired(keys: string[]): void;
    setReconnectAttempts(attempts: number): void;
    setQueueDepth(depth: number): void;
    setHaWsUrl(url: string): void;
    setSubscribedEventTypes(eventTypes: string[]): void;
    setLastEvent(eventType: string, eventTime?: string): void;
    setLastDispatch(mode: DispatchMode, status: string): void;
    setLastError(error?: string): void;
    snapshot(): HaBridgeStatus;
}

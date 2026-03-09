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

export class RuntimeState {
  private status: HaBridgeStatus;

  constructor(seed?: Partial<HaBridgeStatus>) {
    this.status = {
      running: false,
      connected: false,
      configured: false,
      missingRequired: [],
      reconnectAttempts: 0,
      queueDepth: 0,
      subscribedEventTypes: [],
      ...seed,
    };
  }

  setRunning(running: boolean) {
    this.status.running = running;
  }

  setConnected(connected: boolean) {
    this.status.connected = connected;
  }

  setConfigured(configured: boolean) {
    this.status.configured = configured;
  }

  setMissingRequired(keys: string[]) {
    this.status.missingRequired = [...keys];
  }

  setReconnectAttempts(attempts: number) {
    this.status.reconnectAttempts = attempts;
  }

  setQueueDepth(depth: number) {
    this.status.queueDepth = depth;
  }

  setHaWsUrl(url: string) {
    this.status.haWsUrl = url;
  }

  setSubscribedEventTypes(eventTypes: string[]) {
    this.status.subscribedEventTypes = [...eventTypes];
  }

  setLastEvent(eventType: string, eventTime?: string) {
    this.status.lastEventType = eventType;
    this.status.lastEventTime = eventTime;
  }

  setLastDispatch(mode: DispatchMode, status: string) {
    this.status.lastDispatchMode = mode;
    this.status.lastDispatchStatus = status;
  }

  setLastError(error?: string) {
    this.status.lastError = error;
  }

  snapshot(): HaBridgeStatus {
    return {
      ...this.status,
      missingRequired: [...this.status.missingRequired],
      subscribedEventTypes: [...this.status.subscribedEventTypes],
    };
  }
}

export class RuntimeState {
    status;
    constructor(seed) {
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
    setRunning(running) {
        this.status.running = running;
    }
    setConnected(connected) {
        this.status.connected = connected;
    }
    setConfigured(configured) {
        this.status.configured = configured;
    }
    setMissingRequired(keys) {
        this.status.missingRequired = [...keys];
    }
    setReconnectAttempts(attempts) {
        this.status.reconnectAttempts = attempts;
    }
    setQueueDepth(depth) {
        this.status.queueDepth = depth;
    }
    setHaWsUrl(url) {
        this.status.haWsUrl = url;
    }
    setSubscribedEventTypes(eventTypes) {
        this.status.subscribedEventTypes = [...eventTypes];
    }
    setLastEvent(eventType, eventTime) {
        this.status.lastEventType = eventType;
        this.status.lastEventTime = eventTime;
    }
    setLastDispatch(mode, status) {
        this.status.lastDispatchMode = mode;
        this.status.lastDispatchStatus = status;
    }
    setLastError(error) {
        this.status.lastError = error;
    }
    snapshot() {
        return {
            ...this.status,
            missingRequired: [...this.status.missingRequired],
            subscribedEventTypes: [...this.status.subscribedEventTypes],
        };
    }
}

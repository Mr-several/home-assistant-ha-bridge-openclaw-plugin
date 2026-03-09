export class BoundedAsyncQueue {
    maxSize;
    onError;
    items = [];
    stopRequested = false;
    loop = null;
    wakeResolver = null;
    constructor(maxSize, onError) {
        this.maxSize = maxSize;
        this.onError = onError;
    }
    get size() {
        return this.items.length;
    }
    start(handler) {
        if (this.loop) {
            return;
        }
        this.stopRequested = false;
        this.loop = this.runLoop(handler);
    }
    enqueue(item) {
        if (this.stopRequested || this.items.length >= this.maxSize) {
            return false;
        }
        this.items.push(item);
        this.wake();
        return true;
    }
    async stop(options = { drain: false }) {
        this.stopRequested = true;
        if (!options.drain) {
            this.items.length = 0;
        }
        this.wake();
        await this.loop;
        this.loop = null;
    }
    async runLoop(handler) {
        while (true) {
            if (this.items.length === 0) {
                if (this.stopRequested) {
                    return;
                }
                await this.waitForWake();
                continue;
            }
            const item = this.items.shift();
            if (!item) {
                continue;
            }
            try {
                await handler(item);
            }
            catch (error) {
                this.onError?.(error, item);
            }
        }
    }
    waitForWake() {
        return new Promise((resolve) => {
            this.wakeResolver = resolve;
        });
    }
    wake() {
        const resolver = this.wakeResolver;
        this.wakeResolver = null;
        resolver?.();
    }
}

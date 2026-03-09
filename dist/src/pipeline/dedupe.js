export class EventDeduper {
    windowMs;
    cache = new Map();
    constructor(windowMs) {
        this.windowMs = windowMs;
    }
    shouldDrop(key, now = Date.now()) {
        this.gc(now);
        const previous = this.cache.get(key);
        if (typeof previous === "number" && now - previous <= this.windowMs) {
            return true;
        }
        this.cache.set(key, now);
        return false;
    }
    gc(now) {
        if (this.windowMs <= 0) {
            this.cache.clear();
            return;
        }
        for (const [key, timestamp] of this.cache.entries()) {
            if (now - timestamp > this.windowMs) {
                this.cache.delete(key);
            }
        }
    }
}

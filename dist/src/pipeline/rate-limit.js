export class SlidingWindowRateLimiter {
    maxPerMinute;
    windowMs;
    timestamps = [];
    constructor(maxPerMinute, windowMs = 60_000) {
        this.maxPerMinute = maxPerMinute;
        this.windowMs = windowMs;
    }
    allow(now = Date.now()) {
        this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
        if (this.timestamps.length >= this.maxPerMinute) {
            return false;
        }
        this.timestamps.push(now);
        return true;
    }
}

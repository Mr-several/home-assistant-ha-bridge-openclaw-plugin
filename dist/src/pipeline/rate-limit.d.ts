export declare class SlidingWindowRateLimiter {
    private readonly maxPerMinute;
    private readonly windowMs;
    private timestamps;
    constructor(maxPerMinute: number, windowMs?: number);
    allow(now?: number): boolean;
}

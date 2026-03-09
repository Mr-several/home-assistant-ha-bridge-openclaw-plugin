export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly maxPerMinute: number,
    private readonly windowMs: number = 60_000,
  ) {}

  allow(now = Date.now()): boolean {
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < this.windowMs);
    if (this.timestamps.length >= this.maxPerMinute) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }
}

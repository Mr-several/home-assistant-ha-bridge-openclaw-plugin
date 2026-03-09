export class EventDeduper {
  private readonly cache = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  shouldDrop(key: string, now = Date.now()): boolean {
    this.gc(now);
    const previous = this.cache.get(key);
    if (typeof previous === "number" && now - previous <= this.windowMs) {
      return true;
    }
    this.cache.set(key, now);
    return false;
  }

  private gc(now: number) {
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

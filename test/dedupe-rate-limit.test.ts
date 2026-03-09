import { describe, expect, it } from "vitest";
import { EventDeduper } from "../src/pipeline/dedupe.js";
import { SlidingWindowRateLimiter } from "../src/pipeline/rate-limit.js";

describe("pipeline guards", () => {
  it("drops duplicate keys within the dedupe window", () => {
    const deduper = new EventDeduper(5000);
    expect(deduper.shouldDrop("k", 1000)).toBe(false);
    expect(deduper.shouldDrop("k", 2000)).toBe(true);
    expect(deduper.shouldDrop("k", 7001)).toBe(false);
  });

  it("limits events in a one-minute sliding window", () => {
    const limiter = new SlidingWindowRateLimiter(2);
    expect(limiter.allow(1000)).toBe(true);
    expect(limiter.allow(2000)).toBe(true);
    expect(limiter.allow(3000)).toBe(false);
    expect(limiter.allow(61_001)).toBe(true);
  });
});

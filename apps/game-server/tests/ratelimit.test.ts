import { describe, expect, it } from "vitest";
import { SlidingWindow, TokenBucket } from "../src/ratelimit";

describe("TokenBucket", () => {
  it("allows bursts up to capacity then refills over time", () => {
    const b = new TokenBucket(3, 1);
    expect(b.take(1000)).toBe(true);
    expect(b.take(1000)).toBe(true);
    expect(b.take(1000)).toBe(true);
    expect(b.take(1000)).toBe(false);
    expect(b.take(2000)).toBe(true); // 1s refills 1 token
    expect(b.take(2000)).toBe(false);
    expect(b.take(6000)).toBe(true); // capped at capacity
    expect(b.take(6000)).toBe(true);
    expect(b.take(6000)).toBe(true);
    expect(b.take(6000)).toBe(false);
  });
});

describe("SlidingWindow", () => {
  it("caps hits per window per key", () => {
    const w = new SlidingWindow(2, 60_000);
    expect(w.allow("1.2.3.4", 0)).toBe(true);
    expect(w.allow("1.2.3.4", 1_000)).toBe(true);
    expect(w.allow("1.2.3.4", 2_000)).toBe(false);
    expect(w.allow("5.6.7.8", 2_000)).toBe(true);
    expect(w.allow("1.2.3.4", 61_000)).toBe(true);
  });
});

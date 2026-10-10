/** Token-bucket limiter with injectable clock (per-socket event limiting). */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = 0;
  }

  take(now: number = Date.now()): boolean {
    if (this.lastRefill === 0) this.lastRefill = now;
    const elapsed = Math.max(0, (now - this.lastRefill) / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Sliding-window limiter (per-IP connection limiting). */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.maxHits) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    // Opportunistic cleanup so the map cannot grow without bound.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.length === 0 || v[v.length - 1] <= cutoff) this.hits.delete(k);
      }
    }
    this.hits.set(key, recent);
    return true;
  }
}

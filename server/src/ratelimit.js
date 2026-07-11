/**
 * Minimal in-memory sliding-window rate limiter.
 * Good enough for protecting the login/setup endpoints of a single-node app.
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    const timer = setInterval(() => this._sweep(), 10 * 60 * 1000);
    timer.unref?.();
  }

  _sweep() {
    const now = Date.now();
    for (const [key, hits] of this.buckets) {
      const alive = hits.filter((t) => t > now - 60 * 60 * 1000);
      if (alive.length === 0) this.buckets.delete(key);
      else this.buckets.set(key, alive);
    }
  }

  /** Returns true if the action is allowed, false if rate-limited. */
  allow(key, max, windowMs) {
    const now = Date.now();
    const hits = (this.buckets.get(key) || []).filter((t) => t > now - windowMs);
    if (hits.length >= max) {
      this.buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    this.buckets.set(key, hits);
    return true;
  }

  reset(key) {
    this.buckets.delete(key);
  }
}

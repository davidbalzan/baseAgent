import type { MiddlewareHandler } from "hono";

export interface RateLimitWindow {
  maxRequests: number;
  windowMs: number;
}

export class SlidingWindowLimiter {
  private windows = new Map<string, number[]>();

  constructor(private config: RateLimitWindow) {}

  check(key: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;

    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    // Prune expired entries
    const firstValid = timestamps.findIndex((t) => t > cutoff);
    if (firstValid > 0) {
      timestamps.splice(0, firstValid);
    } else if (firstValid === -1) {
      timestamps.length = 0;
    }

    if (timestamps.length < this.config.maxRequests) {
      timestamps.push(now);
      return { allowed: true };
    }

    // Over limit — compute retry delay from oldest entry in window
    const retryAfterMs = timestamps[0] + this.config.windowMs - now;
    return { allowed: false, retryAfterMs };
  }
}

export function createRateLimitMiddleware(
  limiter: SlidingWindowLimiter,
): MiddlewareHandler {
  return async (c, next) => {
    const key =
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      "unknown";

    const result = limiter.check(key);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.retryAfterMs ?? 1000) / 1000);
      c.header("Retry-After", String(retryAfterSec));
      return c.json(
        { error: "Rate limit exceeded", retryAfterMs: result.retryAfterMs },
        429,
      );
    }

    await next();
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { SlidingWindowLimiter, createRateLimitMiddleware } from "../rate-limit.js";

describe("SlidingWindowLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 3, windowMs: 1000 });

    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 2, windowMs: 1000 });

    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);

    const result = limiter.check("user1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it("allows requests again after the window expires", () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 2, windowMs: 1000 });

    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1001);

    expect(limiter.check("user1").allowed).toBe(true);
  });

  it("tracks different keys independently", () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 1, windowMs: 1000 });

    expect(limiter.check("user1").allowed).toBe(true);
    expect(limiter.check("user1").allowed).toBe(false);

    // Different key is independent
    expect(limiter.check("user2").allowed).toBe(true);
    expect(limiter.check("user2").allowed).toBe(false);
  });

  it("returns correct retryAfterMs based on oldest entry", () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 2, windowMs: 5000 });

    vi.setSystemTime(1000);
    expect(limiter.check("k").allowed).toBe(true);

    vi.setSystemTime(2000);
    expect(limiter.check("k").allowed).toBe(true);

    vi.setSystemTime(3000);
    const result = limiter.check("k");
    expect(result.allowed).toBe(false);
    // Oldest entry at t=1000, window=5000, so expires at t=6000
    // At t=3000, retryAfterMs = 6000 - 3000 = 3000
    expect(result.retryAfterMs).toBe(3000);
  });

  it("prunes expired entries and frees capacity", () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 2, windowMs: 1000 });

    vi.setSystemTime(0);
    expect(limiter.check("k").allowed).toBe(true);

    vi.setSystemTime(500);
    expect(limiter.check("k").allowed).toBe(true);

    // At t=500, both entries are in window, limit reached
    expect(limiter.check("k").allowed).toBe(false);

    // Advance so first entry (t=0) expires but second (t=500) is still valid
    vi.setSystemTime(1001);
    expect(limiter.check("k").allowed).toBe(true);

    // Now we have entries at t=500 and t=1001, limit reached again
    expect(limiter.check("k").allowed).toBe(false);
  });
});

describe("createRateLimitMiddleware", () => {
  it("returns 429 with Retry-After header when rate limited", async () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 1, windowMs: 60000 });

    const app = new Hono();
    const mw = createRateLimitMiddleware(limiter);
    app.use("/test", mw);
    app.post("/test", (c) => c.json({ ok: true }));

    // First request should pass
    const res1 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res1.status).toBe(200);

    // Second request should be rate limited
    const res2 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res2.status).toBe(429);

    const body = await res2.json() as { error: string; retryAfterMs: number };
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(res2.headers.get("Retry-After")).toBeTruthy();
  });

  it("allows requests from different IPs independently", async () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 1, windowMs: 60000 });

    const app = new Hono();
    const mw = createRateLimitMiddleware(limiter);
    app.use("/test", mw);
    app.post("/test", (c) => c.json({ ok: true }));

    const res1 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test", {
      method: "POST",
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    expect(res2.status).toBe(200);
  });

  it("falls back to x-real-ip header", async () => {
    const limiter = new SlidingWindowLimiter({ maxRequests: 1, windowMs: 60000 });

    const app = new Hono();
    const mw = createRateLimitMiddleware(limiter);
    app.use("/test", mw);
    app.post("/test", (c) => c.json({ ok: true }));

    const res1 = await app.request("/test", {
      method: "POST",
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/test", {
      method: "POST",
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(res2.status).toBe(429);
  });
});

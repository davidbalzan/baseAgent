import { describe, it, expect, vi } from "vitest";
import { createUserGuard, type RateLimiter } from "../user-guard.js";

describe("createUserGuard", () => {
  it("allows any user when no allowlist or rate limiter", () => {
    const guard = createUserGuard();
    expect(guard("any-user")).toBeNull();
  });

  it("rejects user not on allowlist", () => {
    const guard = createUserGuard(["user1", "user2"]);
    expect(guard("user3")).toBe("not_allowed");
  });

  it("allows user on allowlist", () => {
    const guard = createUserGuard(["user1", "user2"]);
    expect(guard("user1")).toBeNull();
  });

  it("rejects rate-limited user", () => {
    const rateLimiter: RateLimiter = {
      check: vi.fn().mockReturnValue({ allowed: false, retryAfterMs: 1000 }),
    };
    const guard = createUserGuard(undefined, rateLimiter);
    expect(guard("user1")).toBe("rate_limited");
  });

  it("allows user when rate limiter permits", () => {
    const rateLimiter: RateLimiter = {
      check: vi.fn().mockReturnValue({ allowed: true }),
    };
    const guard = createUserGuard(undefined, rateLimiter);
    expect(guard("user1")).toBeNull();
  });

  it("checks allowlist before rate limiter", () => {
    const rateLimiter: RateLimiter = {
      check: vi.fn(),
    };
    const guard = createUserGuard(["user1"], rateLimiter);

    guard("user2");

    // Rate limiter should NOT be called because allowlist rejected first
    expect(rateLimiter.check).not.toHaveBeenCalled();
  });

  it("ignores empty allowlist array", () => {
    const guard = createUserGuard([]);
    expect(guard("any-user")).toBeNull();
  });
});

export interface RateLimiter {
  check(key: string): { allowed: boolean; retryAfterMs?: number };
}

/**
 * Creates a guard function that checks user allowlist + rate limits.
 * Returns null if the user is allowed, or a rejection reason string.
 */
export function createUserGuard(
  allowedUserIds?: string[],
  rateLimiter?: RateLimiter,
): (userId: string) => string | null {
  const allowSet = allowedUserIds?.length ? new Set(allowedUserIds) : null;

  return (userId: string): string | null => {
    if (allowSet && !allowSet.has(userId)) {
      return "not_allowed";
    }
    if (rateLimiter) {
      const rl = rateLimiter.check(userId);
      if (!rl.allowed) {
        return "rate_limited";
      }
    }
    return null;
  };
}

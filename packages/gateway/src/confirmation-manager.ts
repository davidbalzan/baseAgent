const DEFAULT_TIMEOUT_MS = 60_000;

export interface PendingConfirmation {
  resolve: (value: { approved: boolean; reason?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ConfirmationManager {
  /** Register a pending confirmation and return a promise that resolves when user replies or times out. */
  request(key: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }>;
  /** Try to resolve a pending confirmation. Returns true if there was a pending confirmation for this key. */
  tryResolve(key: string, text: string): boolean;
  /** Check whether there is a pending confirmation for a given key. */
  hasPending(key: string): boolean;
  /** Clear all pending confirmations (resolving with timeout). */
  clearAll(): void;
}

export function createConfirmationManager(defaultTimeoutMs?: number): ConfirmationManager {
  const pending = new Map<string, PendingConfirmation>();
  const timeout = defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    request(key: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }> {
      // Clean up any existing pending for this key
      const existing = pending.get(key);
      if (existing) {
        clearTimeout(existing.timer);
        existing.resolve({ approved: false, reason: "Superseded by new confirmation request" });
        pending.delete(key);
      }

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(key);
          resolve({ approved: false, reason: "Confirmation timed out" });
        }, timeoutMs ?? timeout);
        pending.set(key, { resolve, timer });
      });
    },

    tryResolve(key: string, text: string): boolean {
      const entry = pending.get(key);
      if (!entry) return false;

      const reply = text.trim().toLowerCase();
      const approved = reply === "yes" || reply === "y";
      pending.delete(key);
      clearTimeout(entry.timer);
      entry.resolve({
        approved,
        reason: approved ? undefined : `User replied: ${text}`,
      });
      return true;
    },

    hasPending(key: string): boolean {
      return pending.has(key);
    },

    clearAll(): void {
      for (const [key, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve({ approved: false, reason: "Confirmation cleared" });
      }
      pending.clear();
    },
  };
}

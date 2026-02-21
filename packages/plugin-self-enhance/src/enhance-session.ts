export interface EnhanceSession {
  /** Worktree absolute path (e.g. /tmp/baseagent-enhance-a1b2c3) */
  worktreePath: string;
  /** Git branch name (e.g. enhance/add-weather-tool-a1b2c3) */
  branch: string;
  /** Human-readable description of the enhancement */
  description: string;
  /** Whether the last test run passed */
  lastTestPassed: boolean;
  /** Timestamp of session creation */
  createdAt: number;
}

let activeSession: EnhanceSession | null = null;

export function getSession(): EnhanceSession | null {
  return activeSession;
}

export function setSession(session: EnhanceSession | null): void {
  activeSession = session;
}

export function requireSession(): EnhanceSession {
  if (!activeSession) {
    throw new Error("No active enhance session. Call self_enhance with action='start' first.");
  }
  return activeSession;
}

export function requireNoSession(): void {
  if (activeSession) {
    throw new Error(
      `An enhance session is already active: "${activeSession.description}" ` +
      `(branch: ${activeSession.branch}). Abort or apply it before starting a new one.`,
    );
  }
}

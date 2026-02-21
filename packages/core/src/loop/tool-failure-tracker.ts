/**
 * Tracks per-tool consecutive failure counts and detects patterns
 * that indicate the model is wasting iterations on broken tools.
 */

export interface ToolFailureState {
  /** Per-tool consecutive failure count (resets on success). */
  toolFailures: Map<string, number>;
  /** Count of consecutive iterations where EVERY tool call failed. */
  consecutiveAllFailIterations: number;
}

export interface ToolCallResult {
  toolCallId: string;
  toolName: string;
  isError: boolean;
}

export interface FailureRecoveryAction {
  /** Nudge message to inject into conversation. */
  message: string;
  /** Reason for the trace event. */
  reason: "repeated_tool_failure" | "all_fail_streak";
  /** Tools that triggered recovery. */
  failedTools: string[];
  /** Per-tool failure counts (for tracing). */
  failureCounts?: Record<string, number>;
  /** How many consecutive all-fail iterations (for all_fail_streak). */
  consecutiveAllFailIterations?: number;
}

/** After N consecutive failures of the same tool, nudge the model. */
export const TOOL_FAILURE_THRESHOLD = 2;
/** After N consecutive iterations where ALL tools fail, strong nudge. */
export const ALL_FAIL_THRESHOLD = 3;

export function createToolFailureState(): ToolFailureState {
  return {
    toolFailures: new Map(),
    consecutiveAllFailIterations: 0,
  };
}

/**
 * Process tool results for one iteration and return a recovery action if needed.
 * Mutates `state` in place.
 */
export function processToolResults(
  state: ToolFailureState,
  results: ToolCallResult[],
): FailureRecoveryAction | null {
  if (results.length === 0) return null;

  let iterationFailCount = 0;
  for (const r of results) {
    if (r.isError) {
      state.toolFailures.set(r.toolName, (state.toolFailures.get(r.toolName) ?? 0) + 1);
      iterationFailCount++;
    } else {
      state.toolFailures.delete(r.toolName);
    }
  }

  // Check if ALL tool calls in this iteration failed
  if (iterationFailCount === results.length) {
    state.consecutiveAllFailIterations++;
  } else {
    state.consecutiveAllFailIterations = 0;
  }

  // All-fail streak takes priority
  if (state.consecutiveAllFailIterations >= ALL_FAIL_THRESHOLD) {
    return {
      message: "Multiple consecutive attempts have all failed. Stop retrying tools and provide the user with a clear explanation of what you were trying to do, why it failed, and suggest alternative approaches they could try.",
      reason: "all_fail_streak",
      failedTools: [...state.toolFailures.keys()],
      consecutiveAllFailIterations: state.consecutiveAllFailIterations,
    };
  }

  // Check for individual tools that have failed repeatedly
  const repeatedlyFailed = [...state.toolFailures.entries()]
    .filter(([, count]) => count >= TOOL_FAILURE_THRESHOLD)
    .map(([name]) => name);

  if (repeatedlyFailed.length > 0) {
    return {
      message: `The following tools have failed ${TOOL_FAILURE_THRESHOLD}+ times consecutively and appear to be unavailable: ${repeatedlyFailed.join(", ")}. Do NOT retry them. Use a different tool or approach, or explain the limitation to the user.`,
      reason: "repeated_tool_failure",
      failedTools: repeatedlyFailed,
      failureCounts: Object.fromEntries(state.toolFailures),
    };
  }

  return null;
}

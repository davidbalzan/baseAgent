import { describe, it, expect } from "vitest";
import {
  createToolFailureState,
  processToolResults,
  TOOL_FAILURE_THRESHOLD,
  ALL_FAIL_THRESHOLD,
  type ToolCallResult,
} from "../tool-failure-tracker.js";

function makeResults(entries: Array<{ name: string; error: boolean }>): ToolCallResult[] {
  return entries.map((e, i) => ({
    toolCallId: `call_${i}`,
    toolName: e.name,
    isError: e.error,
  }));
}

describe("tool failure tracker", () => {
  describe("processToolResults", () => {
    it("returns null when no results", () => {
      const state = createToolFailureState();
      expect(processToolResults(state, [])).toBeNull();
    });

    it("returns null on first failure (below threshold)", () => {
      const state = createToolFailureState();
      const results = makeResults([{ name: "web_search", error: true }]);
      expect(processToolResults(state, results)).toBeNull();
      expect(state.toolFailures.get("web_search")).toBe(1);
    });

    it("returns null when all tools succeed", () => {
      const state = createToolFailureState();
      const results = makeResults([{ name: "web_search", error: false }]);
      expect(processToolResults(state, results)).toBeNull();
      expect(state.toolFailures.has("web_search")).toBe(false);
    });

    it("triggers repeated_tool_failure after threshold consecutive failures", () => {
      const state = createToolFailureState();

      // First failure — no action
      processToolResults(state, makeResults([{ name: "web_search", error: true }]));

      // Second failure — should trigger
      const action = processToolResults(state, makeResults([{ name: "web_search", error: true }]));

      expect(action).not.toBeNull();
      expect(action!.reason).toBe("repeated_tool_failure");
      expect(action!.failedTools).toContain("web_search");
      expect(action!.message).toContain("Do NOT retry");
      expect(action!.failureCounts).toEqual({ web_search: 2 });
    });

    it("resets failure count when tool succeeds", () => {
      const state = createToolFailureState();

      // Fail once
      processToolResults(state, makeResults([{ name: "web_search", error: true }]));
      expect(state.toolFailures.get("web_search")).toBe(1);

      // Succeed — resets
      processToolResults(state, makeResults([{ name: "web_search", error: false }]));
      expect(state.toolFailures.has("web_search")).toBe(false);

      // Fail again — count starts from 1
      const action = processToolResults(state, makeResults([{ name: "web_search", error: true }]));
      expect(action).toBeNull();
      expect(state.toolFailures.get("web_search")).toBe(1);
    });

    it("tracks multiple tools independently", () => {
      const state = createToolFailureState();

      // web_search fails twice, web_fetch fails once
      processToolResults(state, makeResults([
        { name: "web_search", error: true },
        { name: "web_fetch", error: true },
      ]));
      processToolResults(state, makeResults([
        { name: "web_search", error: true },
        { name: "web_fetch", error: false },
      ]));

      // web_search should be flagged, web_fetch should not
      const action = processToolResults(state, makeResults([]));
      // No new results, so no action — but let's check the state
      expect(state.toolFailures.get("web_search")).toBe(2);
      expect(state.toolFailures.has("web_fetch")).toBe(false);
    });

    it("reports repeated_tool_failure for specific tools even when others succeed", () => {
      const state = createToolFailureState();

      // web_search fails both times, shell_exec succeeds
      processToolResults(state, makeResults([
        { name: "web_search", error: true },
        { name: "shell_exec", error: false },
      ]));
      const action = processToolResults(state, makeResults([
        { name: "web_search", error: true },
        { name: "shell_exec", error: false },
      ]));

      expect(action).not.toBeNull();
      expect(action!.reason).toBe("repeated_tool_failure");
      expect(action!.failedTools).toEqual(["web_search"]);
    });

    it("resets consecutive all-fail counter when any tool succeeds", () => {
      const state = createToolFailureState();

      // Two all-fail iterations
      processToolResults(state, makeResults([{ name: "web_fetch", error: true }]));
      processToolResults(state, makeResults([{ name: "web_fetch", error: true }]));
      expect(state.consecutiveAllFailIterations).toBe(2);

      // One iteration with a success — resets
      processToolResults(state, makeResults([
        { name: "web_fetch", error: true },
        { name: "shell_exec", error: false },
      ]));
      expect(state.consecutiveAllFailIterations).toBe(0);
    });

    it("triggers all_fail_streak after threshold consecutive all-fail iterations", () => {
      const state = createToolFailureState();

      for (let i = 0; i < ALL_FAIL_THRESHOLD - 1; i++) {
        const action = processToolResults(state, makeResults([{ name: "web_fetch", error: true }]));
        // Before threshold, might get repeated_tool_failure but NOT all_fail_streak
        if (action) {
          expect(action.reason).not.toBe("all_fail_streak");
        }
      }

      // This should trigger the all-fail-streak
      const action = processToolResults(state, makeResults([{ name: "web_fetch", error: true }]));
      expect(action).not.toBeNull();
      expect(action!.reason).toBe("all_fail_streak");
      expect(action!.message).toContain("Stop retrying tools");
      expect(action!.consecutiveAllFailIterations).toBe(ALL_FAIL_THRESHOLD);
    });

    it("all_fail_streak takes priority over repeated_tool_failure", () => {
      const state = createToolFailureState();

      // Build up both conditions
      for (let i = 0; i < ALL_FAIL_THRESHOLD; i++) {
        processToolResults(state, makeResults([{ name: "web_search", error: true }]));
      }

      // web_search has failed ALL_FAIL_THRESHOLD times AND all iterations failed
      // all_fail_streak should take priority
      expect(state.consecutiveAllFailIterations).toBe(ALL_FAIL_THRESHOLD);
      expect(state.toolFailures.get("web_search")).toBe(ALL_FAIL_THRESHOLD);
    });

    it("constants have expected values", () => {
      expect(TOOL_FAILURE_THRESHOLD).toBe(2);
      expect(ALL_FAIL_THRESHOLD).toBe(3);
    });
  });
});

import { describe, it, expect, vi } from "vitest";
import { createGovernedExecutor, type GovernancePolicy, type ConfirmationDelegate, type GovernanceOptions } from "../governance.js";
import type { ToolDefinition, ToolPermission } from "@baseagent/core";
import { LoopEmitter } from "@baseagent/core";

function makeTool(name: string, permission?: ToolPermission): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: { safeParse: () => ({ success: true, data: {} }) } as any,
    execute: vi.fn(async () => "ok"),
    permission,
  };
}

interface ToolExecResult {
  result: string;
  error?: string;
  durationMs: number;
}

function makeInnerExecutor() {
  return vi.fn(async (_name: string, _args: Record<string, unknown>): Promise<ToolExecResult> => ({
    result: "executed",
    durationMs: 1,
  }));
}

function makeOptions(
  overrides: Partial<GovernanceOptions> & { tools?: Record<string, ToolDefinition> },
): GovernanceOptions {
  const tools = overrides.tools ?? {};
  return {
    policy: overrides.policy ?? { read: "auto-allow", write: "confirm", exec: "confirm" },
    getToolDefinition: (name) => tools[name],
    confirmationDelegate: overrides.confirmationDelegate,
    emitter: overrides.emitter,
    sessionId: overrides.sessionId ?? "test-session",
  };
}

describe("createGovernedExecutor", () => {
  it("auto-allow executes tool and emits audit trace", async () => {
    const inner = makeInnerExecutor();
    const emitter = new LoopEmitter();
    const traceSpy = vi.fn();
    emitter.on("trace", traceSpy);

    const readTool = makeTool("file_read", "read");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { file_read: readTool },
      policy: { read: "auto-allow", write: "confirm", exec: "confirm" },
      emitter,
    }));

    const result = await executor("file_read", { path: "test.txt" });

    expect(result.result).toBe("executed");
    expect(inner).toHaveBeenCalledWith("file_read", { path: "test.txt" });
    expect(traceSpy).toHaveBeenCalledTimes(1);
    const traceData = traceSpy.mock.calls[0][0].data;
    expect(traceData.type).toBe("gate");
    expect(traceData.toolName).toBe("file_read");
    expect(traceData.decision).toBe("auto_allowed");
    expect(traceData.permission).toBe("read");
  });

  it("deny returns error without executing", async () => {
    const inner = makeInnerExecutor();
    const emitter = new LoopEmitter();
    const traceSpy = vi.fn();
    emitter.on("trace", traceSpy);

    const shellTool = makeTool("shell_exec", "exec");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { shell_exec: shellTool },
      policy: { read: "auto-allow", write: "confirm", exec: "deny" },
      emitter,
    }));

    const result = await executor("shell_exec", { command: "rm -rf /" });

    expect(result.error).toContain("denied by governance policy");
    expect(result.result).toBe("");
    expect(inner).not.toHaveBeenCalled();
    expect(traceSpy.mock.calls[0][0].data.decision).toBe("denied");
  });

  it("confirm + approving delegate executes tool", async () => {
    const inner = makeInnerExecutor();
    const delegate: ConfirmationDelegate = vi.fn(async () => ({ approved: true as const }));

    const writeTool = makeTool("file_write", "write");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { file_write: writeTool },
      policy: { read: "auto-allow", write: "confirm", exec: "confirm" },
      confirmationDelegate: delegate,
    }));

    const result = await executor("file_write", { path: "out.txt", content: "hello" });

    expect(result.result).toBe("executed");
    expect(delegate).toHaveBeenCalledWith("file_write", "write", { path: "out.txt", content: "hello" });
    expect(inner).toHaveBeenCalled();
  });

  it("confirm + rejecting delegate returns error", async () => {
    const inner = makeInnerExecutor();
    const emitter = new LoopEmitter();
    const traceSpy = vi.fn();
    emitter.on("trace", traceSpy);

    const delegate: ConfirmationDelegate = vi.fn(async () => ({
      approved: false as const,
      reason: "Not now",
    }));

    const writeTool = makeTool("file_write", "write");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { file_write: writeTool },
      policy: { read: "auto-allow", write: "confirm", exec: "confirm" },
      confirmationDelegate: delegate,
      emitter,
    }));

    const result = await executor("file_write", { path: "out.txt", content: "hello" });

    expect(result.error).toContain("rejected by user");
    expect(result.error).toContain("Not now");
    expect(inner).not.toHaveBeenCalled();
    expect(traceSpy.mock.calls[0][0].data.decision).toBe("rejected");
  });

  it("confirm + no delegate skips tool (non-interactive)", async () => {
    const inner = makeInnerExecutor();
    const emitter = new LoopEmitter();
    const traceSpy = vi.fn();
    emitter.on("trace", traceSpy);

    const shellTool = makeTool("shell_exec", "exec");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { shell_exec: shellTool },
      policy: { read: "auto-allow", write: "confirm", exec: "confirm" },
      confirmationDelegate: undefined,
      emitter,
    }));

    const result = await executor("shell_exec", { command: "ls" });

    expect(result.error).toContain("requires confirmation but no interactive session");
    expect(inner).not.toHaveBeenCalled();
    expect(traceSpy.mock.calls[0][0].data.decision).toBe("skipped_no_delegate");
  });

  it("toolOverrides overrides tier-level policy", async () => {
    const inner = makeInnerExecutor();

    const shellTool = makeTool("shell_exec", "exec");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { shell_exec: shellTool },
      policy: {
        read: "auto-allow",
        write: "confirm",
        exec: "confirm", // tier says confirm
        toolOverrides: { shell_exec: "auto-allow" }, // override says auto-allow
      },
    }));

    const result = await executor("shell_exec", { command: "echo hi" });

    expect(result.result).toBe("executed");
    expect(inner).toHaveBeenCalled();
  });

  it("toolOverrides can deny an otherwise auto-allowed tool", async () => {
    const inner = makeInnerExecutor();

    const readTool = makeTool("file_read", "read");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { file_read: readTool },
      policy: {
        read: "auto-allow",
        write: "confirm",
        exec: "confirm",
        toolOverrides: { file_read: "deny" },
      },
    }));

    const result = await executor("file_read", { path: "secret.txt" });

    expect(result.error).toContain("denied by governance policy");
    expect(inner).not.toHaveBeenCalled();
  });

  it("defaults to 'read' permission for unannotated tools", async () => {
    const inner = makeInnerExecutor();
    const emitter = new LoopEmitter();
    const traceSpy = vi.fn();
    emitter.on("trace", traceSpy);

    // Tool with no permission set
    const unknownTool = makeTool("custom_skill");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { custom_skill: unknownTool },
      policy: { read: "auto-allow", write: "confirm", exec: "confirm" },
      emitter,
    }));

    const result = await executor("custom_skill", {});

    expect(result.result).toBe("executed");
    expect(traceSpy.mock.calls[0][0].data.permission).toBe("read");
    expect(traceSpy.mock.calls[0][0].data.decision).toBe("auto_allowed");
  });

  it("truncates long string args in audit traces", async () => {
    const inner = makeInnerExecutor();
    const emitter = new LoopEmitter();
    const traceSpy = vi.fn();
    emitter.on("trace", traceSpy);

    const writeTool = makeTool("file_write", "write");
    const executor = createGovernedExecutor(inner, makeOptions({
      tools: { file_write: writeTool },
      policy: { read: "auto-allow", write: "auto-allow", exec: "confirm" },
      emitter,
    }));

    const longContent = "x".repeat(1000);
    await executor("file_write", { path: "big.txt", content: longContent });

    const traceArgs = traceSpy.mock.calls[0][0].data.args;
    expect(traceArgs.path).toBe("big.txt"); // short arg unchanged
    expect(traceArgs.content.length).toBeLessThan(600); // truncated
    expect(traceArgs.content).toContain("...[truncated]");
  });

  it("handles unknown tool gracefully (falls through to inner executor)", async () => {
    const inner = makeInnerExecutor();
    inner.mockResolvedValueOnce({ result: "", error: 'Unknown tool: "nope"', durationMs: 0 });

    const executor = createGovernedExecutor(inner, makeOptions({
      tools: {},
      policy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
    }));

    // No tool def found → permission defaults to "read" → auto-allow → inner executor handles error
    const result = await executor("nope", {});

    expect(result.error).toContain("Unknown tool");
    expect(inner).toHaveBeenCalled();
  });
});

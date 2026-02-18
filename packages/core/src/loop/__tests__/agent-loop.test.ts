import { describe, it, expect, vi } from "vitest";
import { runAgentLoop, type AgentLoopOptions } from "../agent-loop.js";
import { LoopEmitter } from "../loop-events.js";

/**
 * Creates a minimal mock model that returns a text-only response (no tool calls).
 * The model returns `responseText` and reports the given token usage.
 */
function createMockModel(responseText: string, tokens = { promptTokens: 100, completionTokens: 50 }) {
  return {
    specificationVersion: "v1" as const,
    provider: "test",
    modelId: "test-model",
    defaultObjectGenerationMode: undefined,
    doStream: vi.fn(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-delta", textDelta: responseText });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: tokens,
            logprobs: undefined,
            providerMetadata: undefined,
          });
          controller.close();
        },
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    })),
    doGenerate: vi.fn(async () => ({
      text: responseText,
      finishReason: "stop" as const,
      usage: tokens,
      rawCall: { rawPrompt: null, rawSettings: {} },
    })),
  };
}

function baseOptions(overrides: Partial<AgentLoopOptions> = {}): AgentLoopOptions {
  return {
    model: createMockModel("test response") as any,
    systemPrompt: "You are a test assistant.",
    tools: {},
    executeTool: vi.fn(async () => ({ result: "ok", durationMs: 1 })),
    maxIterations: 10,
    timeoutMs: 30_000,
    costCapUsd: 1.0,
    ...overrides,
  };
}

describe("runAgentLoop", () => {
  it("completes a simple text-only loop", async () => {
    const result = await runAgentLoop("Hello", baseOptions());

    expect(result.output).toBe("test response");
    expect(result.state.status).toBe("completed");
    expect(result.state.iteration).toBe(1);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("emits session_complete event", async () => {
    const emitter = new LoopEmitter();
    const completeSpy = vi.fn();
    emitter.on("session_complete", completeSpy);

    await runAgentLoop("Hello", baseOptions(), emitter);

    expect(completeSpy).toHaveBeenCalledTimes(1);
    const payload = completeSpy.mock.calls[0][0];
    expect(payload).toHaveProperty("sessionId");
    expect(payload).toHaveProperty("output");
    expect(payload).toHaveProperty("state");
    expect(payload).toHaveProperty("messages");
    expect(payload).toHaveProperty("toolMessageMeta");
  });

  it("exits immediately when initialState.estimatedCostUsd >= costCapUsd (reproduces bug)", async () => {
    const result = await runAgentLoop("Continue", baseOptions({
      costCapUsd: 0.50,
      initialState: {
        iteration: 5,
        estimatedCostUsd: 0.60,
        promptTokens: 100_000,
        completionTokens: 30_000,
        totalTokens: 130_000,
        status: "running",
      },
    }));

    // With the bug: estimatedCostUsd (0.60) >= costCapUsd (0.50), so loop never enters
    expect(result.state.status).toBe("cost_limit");
    // The loop body should never execute because the while condition fails
    expect(result.state.iteration).toBe(5); // unchanged from initial
  });

  it("runs iterations when costCapUsd is raised above accumulated cost (confirms fix)", async () => {
    const result = await runAgentLoop("Continue", baseOptions({
      // Effective cap: accumulated + additional = 0.60 + 1.0 = 1.60
      costCapUsd: 1.60,
      initialState: {
        iteration: 5,
        estimatedCostUsd: 0.60,
        promptTokens: 100_000,
        completionTokens: 30_000,
        totalTokens: 130_000,
        status: "running",
      },
      initialMessages: [
        { role: "system", content: "You are a test assistant." },
        { role: "user", content: "Earlier input" },
        { role: "assistant", content: "Earlier response" },
      ],
    }));

    // Should actually run at least 1 iteration
    expect(result.state.iteration).toBeGreaterThan(5);
    expect(result.state.status).toBe("completed");
  });

  it("uses initialMessages when provided instead of building from input", async () => {
    const initialMessages = [
      { role: "system" as const, content: "Custom system prompt" },
      { role: "user" as const, content: "Custom user input" },
    ];

    const result = await runAgentLoop("", baseOptions({
      initialMessages,
    }));

    expect(result.state.status).toBe("completed");
    // First message should be the custom system prompt, not the one from options
    expect(result.messages[0].content).toBe("Custom system prompt");
  });

  it("respects maxIterations limit", async () => {
    const result = await runAgentLoop("Hello", baseOptions({
      maxIterations: 1,
    }));

    expect(result.state.iteration).toBe(1);
    expect(result.state.status).toBe("completed");
  });
});

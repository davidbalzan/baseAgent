import { describe, it, expect, vi } from "vitest";
import { createFallbackModel, type FallbackCallback } from "../fallback-model.js";
import type { LanguageModelV1 } from "ai";

function createMockModel(
  id: string,
  responseText: string,
  tokens = { promptTokens: 100, completionTokens: 50 },
): LanguageModelV1 {
  return {
    specificationVersion: "v1" as const,
    provider: `test-${id}`,
    modelId: `model-${id}`,
    defaultObjectGenerationMode: undefined,
    doStream: vi.fn(async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "text-delta" as const, textDelta: responseText });
          controller.enqueue({
            type: "finish" as const,
            finishReason: "stop" as const,
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
  } as unknown as LanguageModelV1;
}

function createFailingModel(id: string, error: Error): LanguageModelV1 {
  return {
    specificationVersion: "v1" as const,
    provider: `test-${id}`,
    modelId: `model-${id}`,
    defaultObjectGenerationMode: undefined,
    doStream: vi.fn(async () => {
      throw error;
    }),
    doGenerate: vi.fn(async () => {
      throw error;
    }),
  } as unknown as LanguageModelV1;
}

const dummyStreamOpts = {
  inputFormat: "messages" as const,
  mode: { type: "regular" as const },
  prompt: [],
} as Parameters<LanguageModelV1["doStream"]>[0];

const dummyGenerateOpts = {
  inputFormat: "messages" as const,
  mode: { type: "regular" as const },
  prompt: [],
} as Parameters<LanguageModelV1["doGenerate"]>[0];

describe("createFallbackModel", () => {
  it("returns primary result when primary succeeds", async () => {
    const primary = createMockModel("primary", "hello");
    const fallback = createMockModel("fallback", "fallback-hello");
    const onFallback = vi.fn();

    const model = createFallbackModel(primary, [fallback], { onFallback });

    const result = await model.doStream(dummyStreamOpts);
    expect(result).toBeDefined();
    expect(result.stream).toBeInstanceOf(ReadableStream);
    expect(onFallback).not.toHaveBeenCalled();
    expect((fallback.doStream as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("falls back when primary fails", async () => {
    const primary = createFailingModel("primary", new Error("rate limited"));
    const fallback = createMockModel("fallback", "fallback-response");
    const onFallback = vi.fn();

    const model = createFallbackModel(primary, [fallback], { onFallback });

    const result = await model.doStream(dummyStreamOpts);
    expect(result).toBeDefined();
    expect(result.stream).toBeInstanceOf(ReadableStream);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith({
      failedProvider: "test-primary",
      failedModelId: "model-primary",
      error: expect.any(Error),
      reason: "rate-limit",
      selectedProvider: "test-fallback",
      selectedModelId: "model-fallback",
      fallbackIndex: 1,
    });
  });

  it("chains through multiple fallbacks", async () => {
    const primary = createFailingModel("primary", new Error("down"));
    const fb1 = createFailingModel("fb1", new Error("also down"));
    const fb2 = createMockModel("fb2", "third-time-charm");
    const onFallback = vi.fn();

    const model = createFallbackModel(primary, [fb1, fb2], { onFallback });

    const result = await model.doStream(dummyStreamOpts);
    expect(result).toBeDefined();
    expect(onFallback).toHaveBeenCalledTimes(2);
    expect(onFallback.mock.calls[0][0].fallbackIndex).toBe(1);
    expect(onFallback.mock.calls[1][0].fallbackIndex).toBe(2);
  });

  it("throws last error when all models fail", async () => {
    const primary = createFailingModel("primary", new Error("fail-1"));
    const fb1 = createFailingModel("fb1", new Error("fail-2"));
    const onFallback = vi.fn();

    const model = createFallbackModel(primary, [fb1], { onFallback });

    await expect(model.doStream(dummyStreamOpts)).rejects.toThrow("fail-2");
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("does not fallback on AbortError — propagates immediately", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const primary = createFailingModel("primary", abortError);
    const fallback = createMockModel("fallback", "should-not-reach");
    const onFallback = vi.fn();

    const model = createFallbackModel(primary, [fallback], { onFallback });

    await expect(model.doStream(dummyStreamOpts)).rejects.toThrow("aborted");
    expect(onFallback).not.toHaveBeenCalled();
    expect((fallback.doStream as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("doGenerate fallback works the same as doStream", async () => {
    const primary = createFailingModel("primary", new Error("generate-fail"));
    const fallback = createMockModel("fallback", "gen-fallback");
    const onFallback = vi.fn();

    const model = createFallbackModel(primary, [fallback], { onFallback });

    const result = await model.doGenerate(dummyGenerateOpts);
    expect(result).toBeDefined();
    expect(result.text).toBe("gen-fallback");
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("keeps quota-window failed model in cooldown across calls", async () => {
    let primaryCalls = 0;
    const primary: LanguageModelV1 = {
      specificationVersion: "v1" as const,
      provider: "test-primary",
      modelId: "model-primary",
      defaultObjectGenerationMode: undefined,
      doStream: vi.fn(async () => {
        primaryCalls += 1;
        if (primaryCalls === 1) {
          throw new Error("monthly usage limit reached");
        }
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-delta" as const, textDelta: "primary-ok" });
              controller.enqueue({
                type: "finish" as const,
                finishReason: "stop" as const,
                usage: { promptTokens: 10, completionTokens: 5 },
                logprobs: undefined,
                providerMetadata: undefined,
              });
              controller.close();
            },
          }),
          rawCall: { rawPrompt: null, rawSettings: {} },
        };
      }),
      doGenerate: vi.fn(async () => ({
        text: "primary-ok",
        finishReason: "stop" as const,
        usage: { promptTokens: 10, completionTokens: 5 },
        rawCall: { rawPrompt: null, rawSettings: {} },
      })),
    } as unknown as LanguageModelV1;

    const fallback = createMockModel("fallback", "fallback-ok");
    const onFallback = vi.fn();
    const model = createFallbackModel(primary, [fallback], { onFallback, cooldownMs: 60_000 });

    await model.doStream(dummyStreamOpts);
    await model.doStream(dummyStreamOpts);

    expect(primaryCalls).toBe(1);
    expect((fallback.doStream as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalled();
    expect(onFallback.mock.calls[1][0].reason).toBe("quota-window");
  });

  it("preserves original cooldown reason when skipping while cooling", async () => {
    const primary = createFailingModel("primary", new Error("fetch failed"));
    const fallback = createMockModel("fallback", "ok");
    const onFallback = vi.fn();
    const model = createFallbackModel(primary, [fallback], {
      onFallback,
      cooldownMs: 60_000,
      cooldownReasons: ["network"],
    });

    await model.doStream(dummyStreamOpts);
    await model.doStream(dummyStreamOpts);

    expect(onFallback).toHaveBeenCalledTimes(2);
    expect(onFallback.mock.calls[0][0].reason).toBe("network");
    expect(onFallback.mock.calls[1][0].reason).toBe("network");
  });

  it("reports composite provider and modelId metadata", () => {
    const primary = createMockModel("a", "hello");
    const fb1 = createMockModel("b", "world");
    const fb2 = createMockModel("c", "!");

    const model = createFallbackModel(primary, [fb1, fb2]);

    expect(model.provider).toBe("fallback(test-a,test-b,test-c)");
    expect(model.modelId).toBe("fallback(model-a,model-b,model-c)");
  });
});

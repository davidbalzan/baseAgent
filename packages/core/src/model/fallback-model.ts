import type { LanguageModelV1 } from "ai";

export type FallbackCallback = (event: {
  failedProvider: string;
  failedModelId: string;
  error: unknown;
  selectedProvider: string;
  selectedModelId: string;
  fallbackIndex: number;
}) => void;

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

/**
 * Creates a LanguageModelV1 that tries the primary model first,
 * then iterates through fallbacks on failure.
 *
 * - AbortError propagates immediately (no fallback).
 * - Mid-stream errors after doStream resolves are NOT retried (v1 limitation).
 */
export function createFallbackModel(
  primary: LanguageModelV1,
  fallbacks: LanguageModelV1[],
  options?: { onFallback?: FallbackCallback },
): LanguageModelV1 {
  const allModels = [primary, ...fallbacks];

  const providerTag = `fallback(${allModels.map((m) => m.provider).join(",")})`;
  const modelIdTag = `fallback(${allModels.map((m) => m.modelId).join(",")})`;

  async function tryWithFallback<T>(
    fn: (model: LanguageModelV1) => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let i = 0; i < allModels.length; i++) {
      try {
        return await fn(allModels[i]);
      } catch (err) {
        if (isAbortError(err)) throw err;

        lastError = err;

        const nextIndex = i + 1;
        if (nextIndex < allModels.length) {
          options?.onFallback?.({
            failedProvider: allModels[i].provider,
            failedModelId: allModels[i].modelId,
            error: err,
            selectedProvider: allModels[nextIndex].provider,
            selectedModelId: allModels[nextIndex].modelId,
            fallbackIndex: nextIndex,
          });
        }
      }
    }

    throw lastError;
  }

  return {
    specificationVersion: "v1",
    provider: providerTag,
    modelId: modelIdTag,
    defaultObjectGenerationMode: primary.defaultObjectGenerationMode,
    supportsImageUrls: primary.supportsImageUrls,
    supportsStructuredOutputs: primary.supportsStructuredOutputs,

    doStream(options) {
      return tryWithFallback((model) => model.doStream(options));
    },

    doGenerate(options) {
      return tryWithFallback((model) => model.doGenerate(options));
    },
  };
}

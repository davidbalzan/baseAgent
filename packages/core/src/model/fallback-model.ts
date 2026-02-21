import type { LanguageModelV1 } from "ai";

export const FALLBACK_REASON_VALUES = [
  "rate-limit",
  "quota-window",
  "auth",
  "network",
  "unknown",
] as const;
export type FallbackReason = (typeof FALLBACK_REASON_VALUES)[number];

export interface FallbackModelStatusEntry {
  index: number;
  provider: string;
  modelId: string;
  inCooldown: boolean;
  cooldownUntil: string | null;
  cooldownRemainingMs: number;
  cooldownReason?: FallbackReason | null;
}

export type FallbackCallback = (event: {
  failedProvider: string;
  failedModelId: string;
  error: unknown;
  reason: FallbackReason;
  selectedProvider: string;
  selectedModelId: string;
  fallbackIndex: number;
}) => void;

function classifyFallbackReason(err: unknown): FallbackReason {
  const status =
    typeof err === "object" && err !== null
      ? ((err as { status?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode)
      : undefined;

  if (status === 429) return "rate-limit";
  if (status === 401 || status === 403) return "auth";

  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (
    message.includes("quota") ||
    message.includes("usage limit") ||
    message.includes("time window") ||
    message.includes("monthly limit") ||
    message.includes("daily limit") ||
    message.includes("insufficient_quota")
  ) {
    return "quota-window";
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("status 429")
  ) {
    return "rate-limit";
  }

  if (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid api key") ||
    message.includes("status 401") ||
    message.includes("status 403")
  ) {
    return "auth";
  }

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econn")
  ) {
    return "network";
  }

  return "unknown";
}

type FallbackIntrospectableModel = LanguageModelV1 & {
  __getFallbackStatus?: () => FallbackModelStatusEntry[];
};

export function getFallbackModelStatus(model: LanguageModelV1): FallbackModelStatusEntry[] | undefined {
  const inspectable = model as FallbackIntrospectableModel;
  if (typeof inspectable.__getFallbackStatus !== "function") {
    return undefined;
  }
  return inspectable.__getFallbackStatus();
}

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
  options?: { onFallback?: FallbackCallback; cooldownMs?: number; cooldownReasons?: FallbackReason[] },
): LanguageModelV1 {
  const allModels = [primary, ...fallbacks];
  const cooldownUntilByIndex = new Map<number, number>();
  const cooldownReasonByIndex = new Map<number, FallbackReason>();
  const cooldownMs = options?.cooldownMs ?? 30 * 60 * 1000;
  const cooldownReasons = new Set<FallbackReason>(options?.cooldownReasons ?? ["quota-window"]);

  const providerTag = `fallback(${allModels.map((m) => m.provider).join(",")})`;
  const modelIdTag = `fallback(${allModels.map((m) => m.modelId).join(",")})`;

  async function tryWithFallback<T>(
    fn: (model: LanguageModelV1) => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let i = 0; i < allModels.length; i++) {
      const now = Date.now();
      const cooldownUntil = cooldownUntilByIndex.get(i);
      if (typeof cooldownUntil === "number") {
        if (cooldownUntil > now) {
          const cooldownReason = cooldownReasonByIndex.get(i) ?? "quota-window";
          const nextIndex = i + 1;
          if (nextIndex < allModels.length) {
            options?.onFallback?.({
              failedProvider: allModels[i].provider,
              failedModelId: allModels[i].modelId,
              error: new Error(
                `Model in cooldown (${cooldownReason}) until ${new Date(cooldownUntil).toISOString()}`,
              ),
              reason: cooldownReason,
              selectedProvider: allModels[nextIndex].provider,
              selectedModelId: allModels[nextIndex].modelId,
              fallbackIndex: nextIndex,
            });
          }
          continue;
        }
        cooldownUntilByIndex.delete(i);
        cooldownReasonByIndex.delete(i);
      }

      try {
        return await fn(allModels[i]);
      } catch (err) {
        if (isAbortError(err)) throw err;

        lastError = err;
        const reason = classifyFallbackReason(err);
        if (cooldownReasons.has(reason) && cooldownMs > 0) {
          cooldownUntilByIndex.set(i, now + cooldownMs);
          cooldownReasonByIndex.set(i, reason);
        }

        const nextIndex = i + 1;
        if (nextIndex < allModels.length) {
          options?.onFallback?.({
            failedProvider: allModels[i].provider,
            failedModelId: allModels[i].modelId,
            error: err,
            reason,
            selectedProvider: allModels[nextIndex].provider,
            selectedModelId: allModels[nextIndex].modelId,
            fallbackIndex: nextIndex,
          });
        }
      }
    }

    throw lastError;
  }

  const modelWithStatus: LanguageModelV1 & { __getFallbackStatus: () => FallbackModelStatusEntry[] } = {
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

    __getFallbackStatus() {
      const now = Date.now();
      return allModels.map((m, index) => {
        const cooldownUntilMs = cooldownUntilByIndex.get(index);
        const inCooldown = typeof cooldownUntilMs === "number" && cooldownUntilMs > now;
        return {
          index,
          provider: m.provider,
          modelId: m.modelId,
          inCooldown,
          cooldownUntil: inCooldown ? new Date(cooldownUntilMs).toISOString() : null,
          cooldownRemainingMs: inCooldown ? cooldownUntilMs - now : 0,
          cooldownReason: inCooldown ? (cooldownReasonByIndex.get(index) ?? null) : null,
        };
      });
    },
  };

  return modelWithStatus;
}

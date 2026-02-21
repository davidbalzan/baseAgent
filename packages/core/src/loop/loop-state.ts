import type { SessionStatus } from "../schemas/session.schema.js";

export interface LoopState {
  iteration: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  status: SessionStatus;
}

export function createLoopState(): LoopState {
  return {
    iteration: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    status: "pending",
  };
}

export interface ModelPricing {
  costPerMInputTokens: number;
  costPerMOutputTokens: number;
}

// Conservative defaults — overridden by llm config in practice.
const DEFAULT_PRICING: ModelPricing = {
  costPerMInputTokens: 0.075,
  costPerMOutputTokens: 0.30,
};

export function updateUsage(
  state: LoopState,
  promptTokens: number,
  completionTokens: number,
  pricing: ModelPricing = DEFAULT_PRICING,
): void {
  state.promptTokens += promptTokens;
  state.completionTokens += completionTokens;
  state.totalTokens = state.promptTokens + state.completionTokens;
  state.estimatedCostUsd +=
    (promptTokens / 1_000_000) * pricing.costPerMInputTokens +
    (completionTokens / 1_000_000) * pricing.costPerMOutputTokens;
}

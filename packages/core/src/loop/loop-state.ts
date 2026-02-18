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

const COST_PER_M_INPUT = 3;
const COST_PER_M_OUTPUT = 15;

export function updateUsage(
  state: LoopState,
  promptTokens: number,
  completionTokens: number,
): void {
  state.promptTokens += promptTokens;
  state.completionTokens += completionTokens;
  state.totalTokens = state.promptTokens + state.completionTokens;
  state.estimatedCostUsd =
    (state.promptTokens / 1_000_000) * COST_PER_M_INPUT +
    (state.completionTokens / 1_000_000) * COST_PER_M_OUTPUT;
}

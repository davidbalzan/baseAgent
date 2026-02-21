import type { LanguageModel } from "ai";
import type { ModelPricing } from "../loop/loop-state.js";

const CAPABLE_KEYWORDS = [
  // Development — tasks that benefit from the stronger model
  "code", "implement", "refactor", "debug", "fix", "bug",
  "write", "create", "build", "deploy", "test",
  "file", "edit", "script", "function", "class",
  "shell", "command", "run", "execute", "install",
  "api", "endpoint", "database", "query", "schema",
  "architecture", "design", "algorithm",
  // Deep analysis — genuinely complex tasks
  "analyze", "summarize", "scrape",
  // Self-modification — always route to capable model
  "enhance",
];

export interface ModelOption {
  model: LanguageModel;
  pricing?: ModelPricing;
}

export interface ModelSelectionResult {
  model: LanguageModel;
  pricing?: ModelPricing;
  routed: boolean;
}

export function selectModel(
  input: string,
  models: { default: ModelOption; capable?: ModelOption },
): ModelSelectionResult {
  if (!models.capable) {
    return { model: models.default.model, pricing: models.default.pricing, routed: false };
  }

  const lower = input.toLowerCase();
  const matched = CAPABLE_KEYWORDS.some((kw) => lower.includes(kw));

  if (matched) {
    return { model: models.capable.model, pricing: models.capable.pricing, routed: true };
  }

  return { model: models.default.model, pricing: models.default.pricing, routed: false };
}

import type { LanguageModel } from "ai";
import type { ModelPricing } from "../loop/loop-state.js";

/**
 * Keywords that trigger routing to the capable (stronger) model.
 *
 * **Known simplification**: This is a substring match against the raw user
 * input — simple, fast, and good-enough for most cases. It has known
 * limitations:
 *
 * - False positives: "I want to *run* to the store" matches "run"
 * - False negatives: Sophisticated prompts that don't use these words
 * - No semantic understanding: Can't distinguish intent from mention
 *
 * This is intentional. The cost difference between the default and capable
 * model is the primary concern. For most real-world usage, keyword matching
 * captures >90% of tool-heavy/coding requests accurately. If finer control
 * is needed, consider an LLM-based classifier (at the cost of an extra
 * inference call per request).
 */
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

/**
 * Route a user message to either the default (cheap) or capable (strong) model
 * using keyword-based heuristics. See {@link CAPABLE_KEYWORDS} for details.
 *
 * Returns `routed: true` when the capable model was selected.
 */
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

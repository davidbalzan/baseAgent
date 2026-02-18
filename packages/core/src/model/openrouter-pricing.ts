import type { ModelPricing } from "../loop/loop-state.js";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

interface OpenRouterModel {
  id: string;
  pricing: {
    prompt: string;   // USD per token
    completion: string;
  };
}

/**
 * Fetch live pricing for a model from the OpenRouter models API.
 * Returns undefined if the model is not found or the request fails.
 * Pricing values are converted from per-token to per-million-tokens.
 */
export async function fetchOpenRouterPricing(modelId: string): Promise<ModelPricing | undefined> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) return undefined;

    const data = await res.json() as { data: OpenRouterModel[] };
    const model = data.data.find((m) => m.id === modelId);
    if (!model) return undefined;

    const input = parseFloat(model.pricing.prompt);
    const output = parseFloat(model.pricing.completion);
    if (isNaN(input) || isNaN(output)) return undefined;

    return {
      costPerMInputTokens: input * 1_000_000,
      costPerMOutputTokens: output * 1_000_000,
    };
  } catch {
    return undefined;
  }
}

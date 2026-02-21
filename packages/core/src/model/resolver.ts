import type { LanguageModel } from "ai";
import type { AppConfig, LlmProvider } from "../schemas/config.schema.js";
import { createFallbackModel, type FallbackCallback } from "./fallback-model.js";

export interface SingleModelSpec {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  providers?: AppConfig["llm"]["providers"];
}

export async function resolveSingleModel(spec: SingleModelSpec): Promise<LanguageModel> {
  const { provider, model, apiKey, providers } = spec;

  switch (provider) {
    case "openrouter": {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      // Pass undefined (not empty string) to let the SDK fall back to env var lookup.
      const openrouter = createOpenRouter({ apiKey: apiKey || undefined });
      return openrouter(model);
    }

    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const key = providers?.anthropic?.apiKey ?? apiKey;
      const anthropic = createAnthropic({ apiKey: key || undefined });
      return anthropic(model);
    }

    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const key = providers?.openai?.apiKey ?? apiKey;
      const openai = createOpenAI({ apiKey: key || undefined });
      return openai(model);
    }

    case "ollama": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const baseURL = providers?.ollama?.baseUrl ?? "http://localhost:11434/v1";
      const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
      return ollama(model);
    }

    case "lm-studio": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const baseURL = providers?.lmStudio?.baseUrl ?? "http://localhost:1234/v1";
      const lmStudio = createOpenAI({ baseURL, apiKey: "lm-studio" });
      return lmStudio(model);
    }

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export async function resolveModel(
  config: AppConfig,
  options?: { onFallback?: FallbackCallback },
): Promise<LanguageModel> {
  const primary = await resolveSingleModel({
    provider: config.llm.provider,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    providers: config.llm.providers,
  });

  const fallbackConfigs = config.llm.fallbackModels;
  if (!fallbackConfigs || fallbackConfigs.length === 0) {
    return primary;
  }

  const fallbacks = await Promise.all(
    fallbackConfigs.map((fb) =>
      resolveSingleModel({
        provider: fb.provider,
        model: fb.model,
        // Inherit top-level apiKey when fallback doesn't specify its own.
        // For cross-provider fallbacks, providers map takes precedence in resolveSingleModel.
        apiKey: fb.apiKey ?? config.llm.apiKey,
        providers: config.llm.providers,
      }),
    ),
  );

  return createFallbackModel(primary, fallbacks, {
    onFallback: options?.onFallback,
  });
}

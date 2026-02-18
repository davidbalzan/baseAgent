import type { LanguageModel } from "ai";
import type { AppConfig } from "../schemas/config.schema.js";

export async function resolveModel(config: AppConfig): Promise<LanguageModel> {
  const { provider, model, apiKey, providers } = config.llm;

  switch (provider) {
    case "openrouter": {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      const openrouter = createOpenRouter({ apiKey });
      return openrouter(model);
    }

    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const key = providers?.anthropic?.apiKey ?? apiKey;
      const anthropic = createAnthropic({ apiKey: key });
      return anthropic(model);
    }

    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const key = providers?.openai?.apiKey ?? apiKey;
      const openai = createOpenAI({ apiKey: key });
      return openai(model);
    }

    case "ollama": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const baseURL = providers?.ollama?.baseUrl ?? "http://localhost:11434/v1";
      const ollama = createOpenAI({ baseURL, apiKey: "ollama" });
      return ollama(model);
    }

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

import type { LanguageModel } from "ai";
import type { AppConfig, LlmProvider } from "../schemas/config.schema.js";
import { createFallbackModel, type FallbackCallback } from "./fallback-model.js";
import { getAnthropicOauthAccessToken, getOpenAIOauthAccessToken } from "./anthropic-oauth.js";
import { createOpenCodeBridgeModel } from "./opencode-bridge.js";

export interface SingleModelSpec {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  providers?: AppConfig["llm"]["providers"];
}

interface ResolvedModelOptions {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  providers?: AppConfig["llm"]["providers"];
  fallbackModels?: Array<{ provider: LlmProvider; model: string; apiKey?: string }>;
  fallbackCooldownMs: number;
  fallbackCooldownReasons: AppConfig["llm"]["fallbackCooldownReasons"];
  onFallback?: FallbackCallback;
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
      const explicitApiKey = providers?.anthropic?.apiKey ?? apiKey;
      const oauthToken = getAnthropicOauthAccessToken({
        authFilePath: providers?.anthropic?.oauthAuthFile,
      });
      const anthropic = createAnthropic({
        apiKey: explicitApiKey || undefined,
        headers: explicitApiKey || !oauthToken
          ? undefined
          : {
            Authorization: `Bearer ${oauthToken}`,
          },
      });
      return anthropic(model);
    }

    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const key =
        providers?.openai?.apiKey ??
        apiKey ??
        getOpenAIOauthAccessToken({
          authFilePath: providers?.openai?.oauthAuthFile,
        });
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

    case "opencode": {
      return createOpenCodeBridgeModel({
        model,
        fallbackModels: providers?.opencode?.modelFallbacks,
        baseUrl: providers?.opencode?.baseUrl,
        providerId: providers?.opencode?.providerId,
        directory: providers?.opencode?.directory,
        timeoutMs: providers?.opencode?.timeoutMs,
        modelCooldownMs: providers?.opencode?.modelCooldownMs,
        modelCooldownReasons: providers?.opencode?.modelCooldownReasons,
      });
    }

    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export async function resolveModel(
  config: AppConfig,
  options?: { onFallback?: FallbackCallback },
): Promise<LanguageModel> {
  return resolveModelWithFallbacks({
    provider: config.llm.provider,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    providers: config.llm.providers,
    fallbackModels: config.llm.fallbackModels,
    fallbackCooldownMs: config.llm.fallbackCooldownMs,
    fallbackCooldownReasons: config.llm.fallbackCooldownReasons,
    onFallback: options?.onFallback,
  });
}

export async function resolveModelWithFallbacks(input: ResolvedModelOptions): Promise<LanguageModel> {
  const primary = await resolveSingleModel({
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    providers: input.providers,
  });

  const fallbackConfigs = input.fallbackModels;
  if (!fallbackConfigs || fallbackConfigs.length === 0) {
    return primary;
  }

  const fallbacks = await Promise.all(
    fallbackConfigs.map((fb) =>
      resolveSingleModel({
        provider: fb.provider,
        model: fb.model,
        // Inherit top-level apiKey only when fallback uses same provider.
        // Cross-provider fallbacks should resolve credentials from provider overrides or OAuth.
        apiKey: fb.apiKey ?? (fb.provider === input.provider ? input.apiKey : undefined),
        providers: input.providers,
      }),
    ),
  );

  return createFallbackModel(primary, fallbacks, {
    onFallback: input.onFallback,
    cooldownMs: input.fallbackCooldownMs,
    cooldownReasons: input.fallbackCooldownReasons,
  });
}

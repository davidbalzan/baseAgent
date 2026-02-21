import type { Plugin, PluginContext, PluginCapabilities, AppConfig } from "@baseagent/core";

export { createOpenCodeBridgeModel } from "./opencode-bridge.js";
export type { OpenCodeBridgeOptions } from "./opencode-bridge.js";

function hasOpencodeReference(config: AppConfig): boolean {
  if (config.llm.provider === "opencode") return true;
  if (config.llm.fallbackModels?.some((fb) => fb.provider === "opencode")) return true;
  return false;
}

export function createOpencodePlugin(): Plugin {
  return {
    name: "opencode",
    phase: "tools",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      if (!hasOpencodeReference(ctx.config)) {
        return null; // self-disable when opencode is not configured
      }

      const providerCfg = ctx.config.llm.providers?.opencode;
      const { createOpenCodeBridgeModel } = await import("./opencode-bridge.js");

      return {
        modelProvider: {
          name: "opencode",
          factory: async ({ model }) =>
            createOpenCodeBridgeModel({
              model,
              fallbackModels: providerCfg?.modelFallbacks,
              baseUrl: providerCfg?.baseUrl,
              providerId: providerCfg?.providerId,
              directory: providerCfg?.directory,
              timeoutMs: providerCfg?.timeoutMs,
              modelCooldownMs: providerCfg?.modelCooldownMs,
              modelCooldownReasons: providerCfg?.modelCooldownReasons,
            }),
        },
        docs: [
          {
            title: "OpenCode Bridge",
            filename: "OPENCODE.md",
            content: [
              "# OpenCode Bridge Plugin",
              "",
              "Routes LLM requests through a local [OpenCode](https://opencode.ai) instance,",
              "allowing the agent to use any model provider that OpenCode supports.",
              "",
              "## How it works",
              "",
              "The bridge creates an AI-SDK-compatible `LanguageModelV1` that:",
              "",
              "1. Creates an OpenCode session via `POST /session`",
              "2. Subscribes to the SSE event stream at `GET /event`",
              "3. Sends the prompt via `POST /session/:id/prompt_async`",
              "4. Translates SSE events into AI-SDK stream parts",
              "",
              "## Configuration",
              "",
              "Set `provider: opencode` in `config/default.yaml`:",
              "",
              "```yaml",
              "llm:",
              "  provider: opencode",
              "  model: openai/gpt-4o",
              "  providers:",
              "    opencode:",
              "      baseUrl: http://127.0.0.1:4096   # OpenCode local server",
              "      providerId: openai                 # default provider for bare model names",
              "      directory: /path/to/project        # x-opencode-directory header",
              "      timeoutMs: 60000                   # per-request timeout",
              "      modelCooldownMs: 1800000           # 30 min cooldown on failure",
              "      modelCooldownReasons:              # which errors trigger cooldown",
              "        - quota-window",
              "        - rate-limit",
              "      modelFallbacks:                    # fallback model chain",
              "        - zhipu/glm-5",
              "```",
              "",
              "## Model references",
              "",
              "Models can be specified as `provider/model` (e.g. `openai/gpt-4o`) or as",
              "bare model names (e.g. `gpt-4o`), in which case the configured `providerId`",
              "is used as the default provider.",
              "",
              "## Cooldown & fallback",
              "",
              "When a model returns a rate-limit or quota error, it is placed in cooldown",
              "for `modelCooldownMs`. The bridge then tries the next model in the",
              "`modelFallbacks` chain. This is independent of the top-level fallback system.",
              "",
              "## Plugin behaviour",
              "",
              "- **Self-disables** when `provider` is not `opencode` and no fallback uses it",
              "- Loaded in the `tools` phase so the provider is registered before the first session",
              "- Registers a `modelProvider` capability that the resolver checks before built-in providers",
            ].join("\n"),
          },
        ],
      };
    },
  };
}

import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import type { RateLimiter } from "@baseagent/gateway";
import { DiscordAdapter } from "./discord/discord-adapter.js";

export interface DiscordPluginOptions {
  rateLimiter?: RateLimiter;
}

export function createDiscordPlugin(opts?: DiscordPluginOptions): Plugin {
  let adapter: DiscordAdapter | undefined;

  return {
    name: "discord",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const config = ctx.config.channels?.discord;
      if (!config?.enabled || !config.token) {
        return null;
      }
      return {};
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const config = ctx.config.channels?.discord;
      if (!config?.enabled || !config.token) return;

      try {
        adapter = new DiscordAdapter(
          config.token,
          ctx.queuedHandleMessage,
          config.allowedUserIds,
          opts?.rateLimiter,
        );
        ctx.registerAdapter(adapter);
        await adapter.start();
      } catch (err) {
        ctx.warn(`[discord] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}

export { DiscordAdapter } from "./discord/discord-adapter.js";

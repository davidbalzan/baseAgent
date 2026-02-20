import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import type { RateLimiter } from "@baseagent/gateway";
import { SlackAdapter } from "./slack/slack-adapter.js";

export interface SlackPluginOptions {
  rateLimiter?: RateLimiter;
}

export function createSlackPlugin(opts?: SlackPluginOptions): Plugin {
  let adapter: SlackAdapter | undefined;

  return {
    name: "slack",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const config = ctx.config.channels?.slack;
      if (!config?.enabled || !config.token || !config.appToken) {
        return null;
      }
      return {};
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const config = ctx.config.channels?.slack;
      if (!config?.enabled || !config.token || !config.appToken) return;

      try {
        adapter = new SlackAdapter(
          config.token,
          config.appToken,
          ctx.queuedHandleMessage,
          config.allowedUserIds,
          opts?.rateLimiter,
        );
        ctx.registerAdapter(adapter);
        await adapter.start();
      } catch (err) {
        ctx.warn(`[slack] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}

export { SlackAdapter } from "./slack/slack-adapter.js";

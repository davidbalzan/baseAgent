import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";

/**
 * Webhook plugin — signals that the webhook route should be enabled.
 * The actual route is created by bootstrap since it requires
 * RunSessionDeps (which are server-internal).
 */
export function createWebhookPlugin(): Plugin {
  return {
    name: "webhook",
    phase: "routes",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      if (ctx.config.webhook?.enabled === false) {
        return null;
      }
      ctx.log("[webhook] Plugin enabled");
      return {};
    },

    async afterInit(_ctx: PluginAfterInitContext): Promise<void> {
      // Route creation is handled by the plugin loader
    },

    async shutdown(): Promise<void> {
      // No cleanup needed
    },
  };
}

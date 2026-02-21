import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

export type SendProactiveFn = (channelId: string, text: string) => Promise<void>;

export function createTestChannelDeliveryTool(): ToolDefinition & { setSendFn: (fn: SendProactiveFn) => void } {
  let sendFn: SendProactiveFn | null = null;

  const tool: ToolDefinition & { setSendFn: (fn: SendProactiveFn) => void } = {
    name: "test_channel_delivery",
    description:
      "Send a test message to a channel to verify delivery is working. " +
      "Use this to diagnose whether the agent can reach a given channel before or after fixing delivery issues.",
    permission: "write",
    parameters: z.object({
      channelId: z.string().describe("The channel ID to send a test message to (e.g. 'telegram:123456')"),
      message: z.string().optional().describe("Custom test message. Defaults to a standard diagnostic message."),
    }),
    async execute(args) {
      if (!sendFn) {
        return "Error: sendProactiveMessage is not available. No channel adapter supports proactive messaging.";
      }

      const msg = args.message ?? "Delivery test from scheduler diagnostics";
      const start = Date.now();

      try {
        await sendFn(args.channelId, msg);
        const elapsed = Date.now() - start;
        return `Delivery successful to ${args.channelId} (${elapsed}ms).`;
      } catch (err) {
        const elapsed = Date.now() - start;
        return `Delivery FAILED to ${args.channelId} after ${elapsed}ms: ${String(err)}`;
      }
    },
    setSendFn(fn: SendProactiveFn) {
      sendFn = fn;
    },
  };

  return tool;
}

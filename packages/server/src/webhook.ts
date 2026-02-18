import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { AppConfig } from "@baseagent/core";
import type { SendProactiveMessageFn } from "@baseagent/gateway";
import { runSession, type RunSessionDeps, type RunSessionResult } from "./run-session.js";

export type RunSessionFn = (
  input: { input: string; channelId?: string },
  deps: RunSessionDeps,
) => Promise<RunSessionResult>;

export interface WebhookDeps {
  config: AppConfig;
  sessionDeps: RunSessionDeps;
  sendProactiveMessage?: SendProactiveMessageFn;
  /** Override for testing — defaults to the real runSession. */
  runSessionFn?: RunSessionFn;
}

const NO_ACTION_PHRASES = [
  "all clear",
  "no actions needed",
  "no action needed",
  "no tasks due",
  "nothing to do",
  "no items due",
  "no action required",
  "no webhook action needed",
];

/** Returns true if the output indicates the agent found nothing to act on. */
export function isNoActionWebhookOutput(output: string): boolean {
  const lower = output.toLowerCase().trim();
  return NO_ACTION_PHRASES.some((phrase) => lower.includes(phrase));
}

/** Builds the prompt sent to the agent for a webhook event. */
export function buildWebhookPrompt(event: string, payload: unknown, now: Date): string {
  const iso = now.toISOString();

  return [
    "You are processing an incoming webhook event.",
    "",
    `**Event:** ${event}`,
    `**Received at:** ${iso}`,
    "",
    "Below is the webhook payload. Analyze it and take appropriate action.",
    'If no action is needed, reply with exactly: "No action needed."',
    "",
    "---",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

/** Verifies an HMAC-SHA256 webhook signature using timing-safe comparison. */
export function verifyWebhookSignature(
  secret: string,
  signature: string,
  body: string,
): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(signature, "utf-8"),
      Buffer.from(expected, "utf-8"),
    );
  } catch {
    // Lengths differ — signature is invalid
    return false;
  }
}

/** Creates a Hono route group for the webhook endpoint. */
export function createWebhookRoute(deps: WebhookDeps) {
  const { config, sessionDeps, sendProactiveMessage } = deps;
  const runSessionImpl = deps.runSessionFn ?? runSession;
  const secret = config.webhook?.secret;
  const resultChannelId = config.webhook?.resultChannelId;

  const app = new Hono();

  app.post("/webhook/:event", async (c) => {
    const event = c.req.param("event");

    // 1. Verify signature if secret is configured
    if (secret) {
      const signature = c.req.header("x-webhook-signature");
      if (!signature) {
        return c.json({ error: "Missing X-Webhook-Signature header" }, 401);
      }
      const rawBody = await c.req.text();
      if (!verifyWebhookSignature(secret, signature, rawBody)) {
        return c.json({ error: "Invalid webhook signature" }, 401);
      }
      // Re-parse body from raw text since we consumed the stream
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      return await handleWebhookEvent(c, event, parsed);
    }

    // 2. No secret — parse JSON body directly
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    return await handleWebhookEvent(c, event, body);
  });

  async function handleWebhookEvent(c: any, event: string, payload: unknown) {
    // Validate payload is an object (not null, not array, not primitive)
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return c.json({ error: "Payload must be a JSON object" }, 400);
    }

    const prompt = buildWebhookPrompt(event, payload, new Date());

    try {
      const result = await runSessionImpl(
        { input: prompt, channelId: `webhook:${event}` },
        sessionDeps,
      );

      const output = result.output;
      console.log(`[webhook] Event "${event}" processed — output: ${output.slice(0, 120)}${output.length > 120 ? "..." : ""}`);

      // Send to channel if configured and output is actionable
      if (resultChannelId && sendProactiveMessage && !isNoActionWebhookOutput(output)) {
        try {
          await sendProactiveMessage(resultChannelId, output);
          console.log(`[webhook] Sent result to ${resultChannelId}`);
        } catch (err) {
          console.error("[webhook] Failed to send proactive message:", err);
        }
      }

      return c.json({
        sessionId: result.sessionId,
        event,
        output: result.output,
        usage: {
          totalTokens: result.state.totalTokens,
          promptTokens: result.state.promptTokens,
          completionTokens: result.state.completionTokens,
          estimatedCostUsd: result.state.estimatedCostUsd,
          iterations: result.state.iteration,
        },
        status: result.state.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error(`[webhook] Event "${event}" failed:`, err);
      return c.json({ error: message }, 500);
    }
  }

  return app;
}

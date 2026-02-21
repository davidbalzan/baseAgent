import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { createLogger, type RunSessionLikeFn } from "@baseagent/core";

const log = createLogger("webhook");

export interface WebhookRouteDeps {
  secret?: string;
  resultChannelId?: string;
  runSession: RunSessionLikeFn;
  sendProactiveMessage?: (channelId: string, text: string) => Promise<void>;
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

export function isNoActionWebhookOutput(output: string): boolean {
  const lower = output.toLowerCase().trim();
  return NO_ACTION_PHRASES.some((phrase) => lower.includes(phrase));
}

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
    return false;
  }
}

export function createWebhookRoute(deps: WebhookRouteDeps) {
  const { secret, resultChannelId, runSession, sendProactiveMessage } = deps;

  const app = new Hono();

  app.post("/webhook/:event", async (c) => {
    const event = c.req.param("event");

    if (secret) {
      const signature = c.req.header("x-webhook-signature");
      if (!signature) {
        return c.json({ error: "Missing X-Webhook-Signature header" }, 401);
      }
      const rawBody = await c.req.text();
      if (!verifyWebhookSignature(secret, signature, rawBody)) {
        return c.json({ error: "Invalid webhook signature" }, 401);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      return await handleWebhookEvent(c, event, parsed);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    return await handleWebhookEvent(c, event, body);
  });

  async function handleWebhookEvent(c: { json: (data: unknown, status?: number) => Response }, event: string, payload: unknown) {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return c.json({ error: "Payload must be a JSON object" }, 400);
    }

    const prompt = buildWebhookPrompt(event, payload, new Date());

    try {
      const result = await runSession({ input: prompt, channelId: `webhook:${event}` });

      const output = result.output;
      log.log(`Event "${event}" processed — output: ${output.slice(0, 120)}${output.length > 120 ? "..." : ""}`);

      if (resultChannelId && sendProactiveMessage && !isNoActionWebhookOutput(output)) {
        try {
          await sendProactiveMessage(resultChannelId, output);
          log.log(`Sent result to ${resultChannelId}`);
        } catch (err) {
          log.error(`Failed to send proactive message: ${err}`);
        }
      }

      return c.json({
        sessionId: result.sessionId,
        event,
        output: result.output,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      log.error(`Event "${event}" failed: ${err}`);
      return c.json({ error: message }, 500);
    }
  }

  return app;
}

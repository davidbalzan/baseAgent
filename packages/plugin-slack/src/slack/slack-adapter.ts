import { App } from "@slack/bolt";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage } from "@baseagent/gateway";
import { createStreamBuffer, createConfirmationManager, createUserGuard, truncateText, extractChannelId, type RateLimiter } from "@baseagent/gateway";

const SLACK_MAX_LENGTH = 4000;
const EDIT_INTERVAL_MS = 1000;

/** Minimal shape of a Slack message event (covers standard + bot subtypes). */
interface SlackMessageEvent {
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  bot_id?: string;
  subtype?: string;
}

export class SlackAdapter implements ChannelAdapter {
  readonly name = "slack";
  private app: App;
  private handleMessage: HandleMessageFn;
  private confirmations = createConfirmationManager();
  private guard: (userId: string) => string | null;

  constructor(
    token: string,
    appToken: string,
    handleMessage: HandleMessageFn,
    allowedUserIds?: string[],
    rateLimiter?: RateLimiter,
  ) {
    this.app = new App({
      token,
      socketMode: true,
      appToken,
    });
    this.handleMessage = handleMessage;
    this.guard = createUserGuard(allowedUserIds, rateLimiter);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.app.message(async ({ message, client }) => {
      const msg = message as SlackMessageEvent;

      // Ignore bot messages
      if (msg.bot_id || msg.subtype === "bot_message") return;

      const channelId = msg.channel;
      const userId = msg.user;
      if (!userId) return;

      // FIX: Check for pending confirmation BEFORE allowlist/rate limiting --
      // approval replies are not new sessions and must never be blocked.
      if (this.confirmations.tryResolve(channelId, msg.text ?? "")) {
        return;
      }

      // Allowlist + rate limit guard
      if (this.guard(userId) !== null) return;

      const text = msg.text ?? "";

      // Send immediate feedback
      let placeholderTs: string | undefined;
      try {
        const result = await client.chat.postMessage({
          channel: channelId,
          text: "Thinking...",
        });
        placeholderTs = result.ts;
      } catch {
        return;
      }

      const editMessage = async (content: string): Promise<void> => {
        if (!placeholderTs) return;
        try {
          await client.chat.update({
            channel: channelId,
            ts: placeholderTs,
            text: content,
          });
        } catch {
          // Silently ignore edit errors (rate limits, deleted message, etc.)
        }
      };

      const streamBuffer = createStreamBuffer(
        { maxLength: SLACK_MAX_LENGTH, editIntervalMs: EDIT_INTERVAL_MS },
        editMessage,
      );

      const incoming: IncomingMessage = {
        text,
        channelId: `slack:${channelId}`,
        userId,
        messageId: msg.ts,
      };

      streamBuffer.start();

      try {
        await this.handleMessage(incoming, streamBuffer.callbacks);
      } catch (err) {
        streamBuffer.callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    });
  }

  async requestConfirmation(channelId: string, prompt: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }> {
    const id = extractChannelId(channelId);
    if (!id) return { approved: false, reason: "Invalid channel ID" };

    try {
      await this.app.client.chat.postMessage({ channel: id, text: prompt });
    } catch (err) {
      return { approved: false, reason: `Failed to send confirmation prompt: ${err instanceof Error ? err.message : String(err)}` };
    }

    return this.confirmations.request(id, timeoutMs);
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    const id = extractChannelId(channelId);
    if (!id) return;

    const truncated = truncateText(text, SLACK_MAX_LENGTH);

    try {
      await this.app.client.chat.postMessage({ channel: id, text: truncated });
    } catch (err) {
      console.error("[slack] sendMessage failed:", err);
    }
  }

  async start(): Promise<void> {
    await this.app.start();
    console.log("[slack] Bot started (Socket Mode)");
  }

  async stop(): Promise<void> {
    this.confirmations.clearAll();
    await this.app.stop();
    console.log("[slack] Bot stopped");
  }
}

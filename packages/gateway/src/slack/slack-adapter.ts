import { App } from "@slack/bolt";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage, StreamCallbacks } from "../adapter.js";

const SLACK_MAX_LENGTH = 4000;
const EDIT_INTERVAL_MS = 1000;
const CONFIRMATION_TIMEOUT_MS = 60_000;

/** Minimal shape of a Slack message event (covers standard + bot subtypes). */
interface SlackMessageEvent {
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  bot_id?: string;
  subtype?: string;
}

interface PendingConfirmation {
  resolve: (value: { approved: boolean; reason?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SlackRateLimiter {
  check(key: string): { allowed: boolean; retryAfterMs?: number };
}

export class SlackAdapter implements ChannelAdapter {
  readonly name = "slack";
  private app: App;
  private handleMessage: HandleMessageFn;
  private pendingConfirmations = new Map<string, PendingConfirmation>();
  private allowedUserIds: Set<string> | null;
  private rateLimiter: SlackRateLimiter | null;

  constructor(
    token: string,
    appToken: string,
    handleMessage: HandleMessageFn,
    allowedUserIds?: string[],
    rateLimiter?: SlackRateLimiter,
  ) {
    this.app = new App({
      token,
      socketMode: true,
      appToken,
    });
    this.handleMessage = handleMessage;
    this.allowedUserIds = allowedUserIds?.length ? new Set(allowedUserIds) : null;
    this.rateLimiter = rateLimiter ?? null;
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

      // Ignore messages from users not on the allowlist
      if (this.allowedUserIds && !this.allowedUserIds.has(userId)) return;

      // Rate limit per user
      if (this.rateLimiter) {
        const rl = this.rateLimiter.check(userId);
        if (!rl.allowed) return;
      }

      // Check for pending confirmation first
      const pending = this.pendingConfirmations.get(channelId);
      if (pending) {
        const reply = (msg.text ?? "").trim().toLowerCase();
        const approved = reply === "yes" || reply === "y";
        this.pendingConfirmations.delete(channelId);
        clearTimeout(pending.timer);
        pending.resolve({ approved, reason: approved ? undefined : `User replied: ${msg.text}` });
        return;
      }

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

      let buffer = "";
      let toolStatus = "";
      let editTimer: ReturnType<typeof setInterval> | null = null;
      let lastEditedText = "";
      let finished = false;

      const editMessage = async (): Promise<void> => {
        if (!placeholderTs) return;

        const display = toolStatus
          ? `${buffer}\n\n_${toolStatus}_`
          : buffer;

        const truncated = display.length > SLACK_MAX_LENGTH
          ? display.slice(0, SLACK_MAX_LENGTH - 4) + "..."
          : display;

        if (!truncated || truncated === lastEditedText) return;

        try {
          await client.chat.update({
            channel: channelId,
            ts: placeholderTs,
            text: truncated,
          });
          lastEditedText = truncated;
        } catch {
          // Silently ignore edit errors (rate limits, deleted message, etc.)
        }
      };

      const incoming: IncomingMessage = {
        text,
        channelId: `slack:${channelId}`,
        userId,
        messageId: msg.ts,
      };

      const stream: StreamCallbacks = {
        onTextDelta: (delta) => {
          buffer += delta;
        },
        onToolCall: (toolName) => {
          toolStatus = `Using ${toolName}...`;
        },
        onFinish: async (output) => {
          finished = true;
          if (editTimer) clearInterval(editTimer);
          buffer = output || buffer;
          toolStatus = "";
          await editMessage();
        },
        onError: async (error) => {
          finished = true;
          if (editTimer) clearInterval(editTimer);
          buffer = `Error: ${error.message}`;
          toolStatus = "";
          await editMessage();
        },
      };

      // Start periodic edits
      editTimer = setInterval(() => {
        if (!finished) {
          editMessage();
        }
      }, EDIT_INTERVAL_MS);

      try {
        await this.handleMessage(incoming, stream);
      } catch (err) {
        if (!finished) {
          if (editTimer) clearInterval(editTimer);
          buffer = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
          toolStatus = "";
          await editMessage();
        }
      }
    });
  }

  async requestConfirmation(channelId: string, prompt: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }> {
    const id = channelId.split(":")[1];
    if (!id) return { approved: false, reason: "Invalid channel ID" };

    try {
      await this.app.client.chat.postMessage({ channel: id, text: prompt });
    } catch (err) {
      return { approved: false, reason: `Failed to send confirmation prompt: ${err instanceof Error ? err.message : String(err)}` };
    }

    const timeout = timeoutMs ?? CONFIRMATION_TIMEOUT_MS;
    return new Promise<{ approved: boolean; reason?: string }>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingConfirmations.delete(id);
        resolve({ approved: false, reason: "Confirmation timed out" });
      }, timeout);
      this.pendingConfirmations.set(id, { resolve, timer });
    });
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    const id = channelId.split(":")[1];
    if (!id) return;

    const truncated = text.length > SLACK_MAX_LENGTH
      ? text.slice(0, SLACK_MAX_LENGTH - 4) + "..."
      : text;

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
    await this.app.stop();
    console.log("[slack] Bot stopped");
  }
}

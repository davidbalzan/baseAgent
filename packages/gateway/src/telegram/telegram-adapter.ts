import { Telegraf } from "telegraf";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage, StreamCallbacks } from "../adapter.js";

const TELEGRAM_MAX_LENGTH = 4096;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 4000;
const CONFIRMATION_TIMEOUT_MS = 60_000;

interface PendingConfirmation {
  resolve: (value: { approved: boolean; reason?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface TelegramRateLimiter {
  check(key: string): { allowed: boolean; retryAfterMs?: number };
}

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private bot: Telegraf;
  private handleMessage: HandleMessageFn;
  private pendingConfirmations = new Map<number, PendingConfirmation>();
  private allowedUserIds: Set<string> | null;
  private rateLimiter: TelegramRateLimiter | null;

  constructor(token: string, handleMessage: HandleMessageFn, allowedUserIds?: string[], rateLimiter?: TelegramRateLimiter) {
    this.bot = new Telegraf(token);
    this.handleMessage = handleMessage;
    this.allowedUserIds = allowedUserIds?.length ? new Set(allowedUserIds) : null;
    this.rateLimiter = rateLimiter ?? null;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.on("text", async (ctx) => {
      const chatId = ctx.chat.id;
      const userId = String(ctx.from.id);

      // Check for pending confirmation before any rate limiting —
      // approval replies are not new sessions and must never be blocked.
      const pending = this.pendingConfirmations.get(chatId);
      if (pending) {
        const reply = ctx.message.text.trim().toLowerCase();
        const approved = reply === "yes" || reply === "y";
        this.pendingConfirmations.delete(chatId);
        clearTimeout(pending.timer);
        pending.resolve({ approved, reason: approved ? undefined : `User replied: ${ctx.message.text}` });
        return;
      }

      // Ignore messages from users not on the allowlist
      if (this.allowedUserIds && !this.allowedUserIds.has(userId)) return;

      // Rate limit per user
      if (this.rateLimiter) {
        const rl = this.rateLimiter.check(userId);
        if (!rl.allowed) return;
      }

      const text = ctx.message.text;

      // Send typing indicator immediately
      try { await ctx.sendChatAction("typing"); } catch {}

      // Send immediate feedback
      const placeholder = await ctx.reply("Thinking...");

      let buffer = "";
      let toolStatus = "";
      let editTimer: ReturnType<typeof setInterval> | null = null;
      const typingTimer = setInterval(() => {
        try { ctx.sendChatAction("typing").catch(() => {}); } catch {}
      }, TYPING_INTERVAL_MS);
      let lastEditedText = "";
      let finished = false;

      const editMessage = async (): Promise<void> => {
        const display = toolStatus
          ? `${buffer}\n\n_${toolStatus}_`
          : buffer;

        const truncated = display.length > TELEGRAM_MAX_LENGTH
          ? display.slice(0, TELEGRAM_MAX_LENGTH - 4) + "..."
          : display;

        if (!truncated || truncated === lastEditedText) return;

        try {
          await ctx.telegram.editMessageText(
            chatId,
            placeholder.message_id,
            undefined,
            truncated,
            { parse_mode: "Markdown" },
          );
          lastEditedText = truncated;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          // Ignore "message is not modified" errors
          if (!message.includes("message is not modified")) {
            // Retry without Markdown if parse fails
            if (message.includes("can't parse entities")) {
              try {
                await ctx.telegram.editMessageText(
                  chatId,
                  placeholder.message_id,
                  undefined,
                  truncated,
                );
                lastEditedText = truncated;
              } catch {
                // Silently ignore fallback errors
              }
            }
          }
        }
      };

      const incoming: IncomingMessage = {
        text,
        channelId: `telegram:${chatId}`,
        userId: String(ctx.from.id),
        messageId: String(ctx.message.message_id),
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
          clearInterval(typingTimer);
          buffer = output || buffer;
          toolStatus = "";
          await editMessage();
        },
        onError: async (error) => {
          finished = true;
          if (editTimer) clearInterval(editTimer);
          clearInterval(typingTimer);
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

      // Fire-and-forget: don't await so Telegraf's polling loop can
      // continue receiving updates (e.g. governance confirmation replies).
      this.handleMessage(incoming, stream).catch(async (err) => {
        if (!finished) {
          if (editTimer) clearInterval(editTimer);
          clearInterval(typingTimer);
          buffer = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
          toolStatus = "";
          await editMessage();
        }
      });
    });
  }

  async requestConfirmation(channelId: string, prompt: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }> {
    const chatId = Number(channelId.split(":")[1]);
    if (!chatId) return { approved: false, reason: "Invalid channel ID" };

    try {
      await this.bot.telegram.sendMessage(chatId, prompt);
    } catch (err) {
      return { approved: false, reason: `Failed to send confirmation prompt: ${err instanceof Error ? err.message : String(err)}` };
    }

    const timeout = timeoutMs ?? CONFIRMATION_TIMEOUT_MS;
    return new Promise<{ approved: boolean; reason?: string }>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingConfirmations.delete(chatId);
        resolve({ approved: false, reason: "Confirmation timed out" });
      }, timeout);
      this.pendingConfirmations.set(chatId, { resolve, timer });
    });
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    const chatId = channelId.split(":")[1];
    if (!chatId) return;

    const truncated = text.length > TELEGRAM_MAX_LENGTH
      ? text.slice(0, TELEGRAM_MAX_LENGTH - 4) + "..."
      : text;

    try {
      await this.bot.telegram.sendMessage(chatId, truncated, { parse_mode: "Markdown" });
    } catch {
      // Retry without Markdown if parse fails
      try {
        await this.bot.telegram.sendMessage(chatId, truncated);
      } catch (err) {
        console.error("[telegram] sendMessage failed:", err);
      }
    }
  }

  async start(): Promise<void> {
    // bot.launch() never resolves (runs polling loop forever),
    // so we verify the token with getMe() first, then fire-and-forget launch.
    const botInfo = await this.bot.telegram.getMe();
    console.log(`[telegram] Bot @${botInfo.username} authenticated`);
    this.bot.launch({ dropPendingUpdates: true });
    console.log("[telegram] Bot started (long polling)");
  }

  async stop(): Promise<void> {
    this.bot.stop();
    console.log("[telegram] Bot stopped");
  }
}

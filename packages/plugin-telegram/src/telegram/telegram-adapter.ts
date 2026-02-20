import { Telegraf } from "telegraf";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage } from "@baseagent/gateway";
import { createStreamBuffer, createConfirmationManager, createUserGuard, truncateText, extractChannelId, type RateLimiter } from "@baseagent/gateway";

const TELEGRAM_MAX_LENGTH = 4096;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 4000;

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private bot: Telegraf;
  private handleMessage: HandleMessageFn;
  private confirmations = createConfirmationManager();
  private guard: (userId: string) => string | null;

  constructor(token: string, handleMessage: HandleMessageFn, allowedUserIds?: string[], rateLimiter?: RateLimiter) {
    this.bot = new Telegraf(token);
    this.handleMessage = handleMessage;
    this.guard = createUserGuard(allowedUserIds, rateLimiter);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.on("text", async (ctx) => {
      const chatId = ctx.chat.id;
      const userId = String(ctx.from.id);

      // Check for pending confirmation before any rate limiting --
      // approval replies are not new sessions and must never be blocked.
      if (this.confirmations.tryResolve(String(chatId), ctx.message.text)) {
        return;
      }

      // Allowlist + rate limit guard
      if (this.guard(userId) !== null) return;

      const text = ctx.message.text;

      // Send typing indicator immediately
      try { await ctx.sendChatAction("typing"); } catch {}

      // Send immediate feedback
      const placeholder = await ctx.reply("Thinking...");

      const editMessage = async (content: string): Promise<void> => {
        try {
          await ctx.telegram.editMessageText(
            chatId,
            placeholder.message_id,
            undefined,
            content,
            { parse_mode: "Markdown" },
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes("message is not modified")) {
            if (message.includes("can't parse entities")) {
              try {
                await ctx.telegram.editMessageText(
                  chatId,
                  placeholder.message_id,
                  undefined,
                  content,
                );
              } catch {
                // Silently ignore fallback errors
              }
            }
          }
        }
      };

      const streamBuffer = createStreamBuffer(
        { maxLength: TELEGRAM_MAX_LENGTH, editIntervalMs: EDIT_INTERVAL_MS },
        editMessage,
        {
          sendTyping: () => { ctx.sendChatAction("typing").catch(() => {}); },
          typingIntervalMs: TYPING_INTERVAL_MS,
        },
      );

      const incoming: IncomingMessage = {
        text,
        channelId: `telegram:${chatId}`,
        userId,
        messageId: String(ctx.message.message_id),
      };

      streamBuffer.start();

      // Fire-and-forget: don't await so Telegraf's polling loop can
      // continue receiving updates (e.g. governance confirmation replies).
      this.handleMessage(incoming, streamBuffer.callbacks).catch(async (err) => {
        streamBuffer.callbacks.onError(
          err instanceof Error ? err : new Error(String(err)),
        );
      });
    });
  }

  async requestConfirmation(channelId: string, prompt: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return { approved: false, reason: "Invalid channel ID" };

    try {
      await this.bot.telegram.sendMessage(chatId, prompt);
    } catch (err) {
      return { approved: false, reason: `Failed to send confirmation prompt: ${err instanceof Error ? err.message : String(err)}` };
    }

    return this.confirmations.request(chatId, timeoutMs);
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return;

    const truncated = truncateText(text, TELEGRAM_MAX_LENGTH);

    try {
      await this.bot.telegram.sendMessage(chatId, truncated, { parse_mode: "Markdown" });
    } catch {
      try {
        await this.bot.telegram.sendMessage(chatId, truncated);
      } catch (err) {
        console.error("[telegram] sendMessage failed:", err);
      }
    }
  }

  async start(): Promise<void> {
    const botInfo = await this.bot.telegram.getMe();
    console.log(`[telegram] Bot @${botInfo.username} authenticated`);
    this.bot.launch({ dropPendingUpdates: false });
    console.log("[telegram] Bot started (long polling, will process queued messages)");
  }

  async stop(): Promise<void> {
    this.confirmations.clearAll();
    this.bot.stop();
    console.log("[telegram] Bot stopped");
  }
}

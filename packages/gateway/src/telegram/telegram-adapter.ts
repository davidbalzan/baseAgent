import { Telegraf } from "telegraf";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage, StreamCallbacks } from "../adapter.js";

const TELEGRAM_MAX_LENGTH = 4096;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 4000;

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private bot: Telegraf;
  private handleMessage: HandleMessageFn;

  constructor(token: string, handleMessage: HandleMessageFn) {
    this.bot = new Telegraf(token);
    this.handleMessage = handleMessage;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.bot.on("text", async (ctx) => {
      const chatId = ctx.chat.id;
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

      try {
        await this.handleMessage(incoming, stream);
      } catch (err) {
        if (!finished) {
          if (editTimer) clearInterval(editTimer);
          clearInterval(typingTimer);
          buffer = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
          toolStatus = "";
          await editMessage();
        }
      }
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

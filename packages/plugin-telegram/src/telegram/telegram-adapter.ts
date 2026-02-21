import { Telegraf } from "telegraf";
import { message, callbackQuery } from "telegraf/filters";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage, IncomingMessageAttachment } from "@baseagent/gateway";
import { createStreamBuffer, createConfirmationManager, createUserGuard, truncateText, extractChannelId, type RateLimiter } from "@baseagent/gateway";

const TELEGRAM_MAX_LENGTH = 4096;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 4000;

export interface TelegramConfig {
  token: string;
  webhook?: {
    enabled: boolean;
    url?: string;
    secret?: string;
  };
}


interface MediaMessageContext {
  chat: { id: number | string };
  from: { id: number | string };
  message?: { message_id?: number };
  telegram: {
    editMessageText: (
      chatId: number | string,
      messageId: number,
      inlineMessageId: string | undefined,
      text: string,
      extra?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  sendChatAction: (action: "typing") => Promise<unknown>;
  reply: (text: string) => Promise<{ message_id: number }>;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram";
  private bot: Telegraf;
  private handleMessage: HandleMessageFn;
  private confirmations = createConfirmationManager();
  private guard: (userId: string) => string | null;
  private config: TelegramConfig;

  constructor(config: TelegramConfig, handleMessage: HandleMessageFn, allowedUserIds?: string[], rateLimiter?: RateLimiter) {
    this.config = config;
    this.bot = new Telegraf(config.token);
    this.handleMessage = handleMessage;
    this.guard = createUserGuard(allowedUserIds, rateLimiter);
    this.setupHandlers();
  }

  // ─── Shared helpers ──────────────────────────────────────────────

  /** Build an editMessage function bound to a specific chat message. */
  private buildEditFn(
    tg: MediaMessageContext["telegram"],
    chatId: number | string,
    messageId: number,
  ): (content: string) => Promise<void> {
    return async (content: string): Promise<void> => {
      try {
        await tg.editMessageText(chatId, messageId, undefined, content, { parse_mode: "Markdown" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("message is not modified")) {
          if (msg.includes("can't parse entities")) {
            try {
              await tg.editMessageText(chatId, messageId, undefined, content);
            } catch {
              // Silently ignore fallback errors
            }
          }
        }
      }
    };
  }

  /** Fire-and-forget dispatch: don't await so Telegraf's polling loop can
   *  continue receiving updates (e.g. governance confirmation replies). */
  private dispatch(
    incoming: IncomingMessage,
    buffer: ReturnType<typeof createStreamBuffer>,
  ): void {
    this.handleMessage(incoming, buffer.callbacks).catch((err) => {
      buffer.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    });
  }

  // ─── Handler setup ───────────────────────────────────────────────

  private setupHandlers(): void {
    // Handle text messages
    this.bot.on(message("text"), async (ctx) => {
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

      try { await ctx.sendChatAction("typing"); } catch {}

      const placeholder = await ctx.reply("Thinking...");
      const editMessage = this.buildEditFn(ctx.telegram, chatId, placeholder.message_id);

      const buffer = createStreamBuffer(
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

      buffer.start();
      this.dispatch(incoming, buffer);
    });

    // Handle callback queries (inline keyboard button presses)
    this.bot.on(callbackQuery("data"), async (ctx) => {
      const cbQuery = ctx.callbackQuery;
      const chatId = cbQuery.message?.chat.id;
      const userId = String(cbQuery.from.id);

      if (!chatId) return;

      // Acknowledge the callback query to remove the loading state
      await ctx.answerCbQuery();

      // Check allowlist + rate limit guard
      if (this.guard(userId) !== null) return;

      const text = `[CALLBACK] ${cbQuery.data || ""}`;

      try { await ctx.sendChatAction("typing"); } catch {}

      const placeholder = await ctx.reply("Processing...");
      const editMessage = this.buildEditFn(ctx.telegram, chatId, placeholder.message_id);

      const buffer = createStreamBuffer(
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
        messageId: String(cbQuery.message?.message_id || 0),
        attachments: [{
          kind: "callback_query",
          payload: {
            data: cbQuery.data,
            messageId: cbQuery.message?.message_id,
          },
        }],
      };

      buffer.start();
      this.dispatch(incoming, buffer);
    });

    // Handle photo messages
    this.bot.on(message("photo"), async (ctx) => {
      await this.handleMediaMessage(ctx, "photo", {
        fileId: ctx.message.photo[ctx.message.photo.length - 1]?.file_id,
        width: ctx.message.photo[ctx.message.photo.length - 1]?.width,
        height: ctx.message.photo[ctx.message.photo.length - 1]?.height,
        caption: ctx.message.caption,
      });
    });

    // Handle video messages
    this.bot.on(message("video"), async (ctx) => {
      await this.handleMediaMessage(ctx, "video", {
        fileId: ctx.message.video.file_id,
        mimeType: ctx.message.video.mime_type,
        fileName: ctx.message.video.file_name,
        fileSize: ctx.message.video.file_size,
        width: ctx.message.video.width,
        height: ctx.message.video.height,
        durationSeconds: ctx.message.video.duration,
        caption: ctx.message.caption,
      });
    });

    // Handle audio messages
    this.bot.on(message("audio"), async (ctx) => {
      await this.handleMediaMessage(ctx, "audio", {
        fileId: ctx.message.audio.file_id,
        mimeType: ctx.message.audio.mime_type,
        fileName: ctx.message.audio.file_name,
        fileSize: ctx.message.audio.file_size,
        durationSeconds: ctx.message.audio.duration,
        caption: ctx.message.caption,
      });
    });

    // Handle voice messages
    this.bot.on(message("voice"), async (ctx) => {
      await this.handleMediaMessage(ctx, "voice", {
        fileId: ctx.message.voice.file_id,
        mimeType: ctx.message.voice.mime_type,
        fileSize: ctx.message.voice.file_size,
        durationSeconds: ctx.message.voice.duration,
      });
    });

    // Handle document messages
    this.bot.on(message("document"), async (ctx) => {
      await this.handleMediaMessage(ctx, "document", {
        fileId: ctx.message.document.file_id,
        mimeType: ctx.message.document.mime_type,
        fileName: ctx.message.document.file_name,
        fileSize: ctx.message.document.file_size,
        caption: ctx.message.caption,
      });
    });

    // Handle sticker messages
    this.bot.on(message("sticker"), async (ctx) => {
      await this.handleMediaMessage(ctx, "sticker", {
        fileId: ctx.message.sticker.file_id,
        width: ctx.message.sticker.width,
        height: ctx.message.sticker.height,
        payload: {
          emoji: ctx.message.sticker.emoji,
          setName: ctx.message.sticker.set_name,
        },
      });
    });

    // Handle animation messages (GIFs)
    this.bot.on(message("animation"), async (ctx) => {
      await this.handleMediaMessage(ctx, "animation", {
        fileId: ctx.message.animation.file_id,
        mimeType: ctx.message.animation.mime_type,
        fileName: ctx.message.animation.file_name,
        fileSize: ctx.message.animation.file_size,
        width: ctx.message.animation.width,
        height: ctx.message.animation.height,
        durationSeconds: ctx.message.animation.duration,
        caption: ctx.message.caption,
      });
    });

    // Handle video note messages (round video)
    this.bot.on(message("video_note"), async (ctx) => {
      await this.handleMediaMessage(ctx, "video_note", {
        fileId: ctx.message.video_note.file_id,
        fileSize: ctx.message.video_note.file_size,
        durationSeconds: ctx.message.video_note.duration,
      });
    });

    // Handle location messages
    this.bot.on(message("location"), async (ctx) => {
      const location = ctx.message.location;
      const livePeriod = "live_period" in location ? location.live_period : undefined;
      const heading = "heading" in location ? location.heading : undefined;
      const proximityAlertRadius = "proximity_alert_radius" in location
        ? location.proximity_alert_radius
        : undefined;

      await this.handleMediaMessage(ctx, "location", {
        payload: {
          latitude: location.latitude,
          longitude: location.longitude,
          livePeriod,
          heading,
          proximityAlertRadius,
        },
      });
    });

    // Handle contact messages
    this.bot.on(message("contact"), async (ctx) => {
      await this.handleMediaMessage(ctx, "contact", {
        payload: {
          phoneNumber: ctx.message.contact.phone_number,
          firstName: ctx.message.contact.first_name,
          lastName: ctx.message.contact.last_name,
          userId: ctx.message.contact.user_id,
          vcard: ctx.message.contact.vcard,
        },
      });
    });

    // Handle venue messages
    this.bot.on(message("venue"), async (ctx) => {
      await this.handleMediaMessage(ctx, "venue", {
        payload: {
          location: {
            latitude: ctx.message.venue.location.latitude,
            longitude: ctx.message.venue.location.longitude,
          },
          title: ctx.message.venue.title,
          address: ctx.message.venue.address,
          foursquareId: ctx.message.venue.foursquare_id,
          foursquareType: ctx.message.venue.foursquare_type,
          googlePlaceId: ctx.message.venue.google_place_id,
          googlePlaceType: ctx.message.venue.google_place_type,
        },
      });
    });

    // Handle poll messages
    this.bot.on(message("poll"), async (ctx) => {
      const poll = ctx.message.poll;
      await this.handleMediaMessage(ctx, "poll", {
        payload: {
          id: poll.id,
          question: poll.question,
          options: poll.options.map((o) => ({
            text: o.text,
            voterCount: o.voter_count,
          })),
          totalVoterCount: poll.total_voter_count,
          isClosed: poll.is_closed,
          isAnonymous: poll.is_anonymous,
          type: poll.type,
          allowsMultipleAnswers: poll.allows_multiple_answers,
        },
      });
    });
  }

  private async handleMediaMessage(
    ctx: MediaMessageContext,
    kind: string,
    attachment: Partial<IncomingMessageAttachment>,
  ): Promise<void> {
    const chatId = ctx.chat.id;
    const userId = String(ctx.from.id);

    // Media messages can't resolve text-based confirmations — drop silently.
    if (this.confirmations.hasPending(String(chatId))) return;

    // Allowlist + rate limit guard
    if (this.guard(userId) !== null) return;

    try { await ctx.sendChatAction("typing"); } catch {}

    const placeholder = await ctx.reply("Processing...");
    const editMessage = this.buildEditFn(ctx.telegram, chatId, placeholder.message_id);

    const buffer = createStreamBuffer(
      { maxLength: TELEGRAM_MAX_LENGTH, editIntervalMs: EDIT_INTERVAL_MS },
      editMessage,
      {
        sendTyping: () => { ctx.sendChatAction("typing").catch(() => {}); },
        typingIntervalMs: TYPING_INTERVAL_MS,
      },
    );

    const incoming: IncomingMessage = {
      text: attachment.caption || `[${kind.toUpperCase()}]`,
      channelId: `telegram:${chatId}`,
      userId,
      messageId: String(ctx.message?.message_id ?? 0),
      attachments: [{
        kind,
        ...attachment,
      } as IncomingMessageAttachment],
    };

    buffer.start();
    this.dispatch(incoming, buffer);
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

  async sendMessage(channelId: string, text: string, options?: {
    inlineKeyboard?: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
  }): Promise<void> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return;

    const truncated = truncateText(text, TELEGRAM_MAX_LENGTH);
    const replyMarkup = options?.inlineKeyboard
      ? { inline_keyboard: options.inlineKeyboard }
      : undefined;

    // Type cast is required because our button type allows optional url/callback_data
    // while Telegraf's discriminated union requires exactly one of them set.
    type TgExtra = Parameters<typeof this.bot.telegram.sendMessage>[2];
    const extra = { parse_mode: "Markdown" as const, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) } as TgExtra;
    const fallback = (replyMarkup ? { reply_markup: replyMarkup } : {}) as TgExtra;

    try {
      await this.bot.telegram.sendMessage(chatId, truncated, extra);
    } catch {
      try {
        await this.bot.telegram.sendMessage(chatId, truncated, fallback);
      } catch (err) {
        console.error("[telegram] sendMessage failed:", err);
      }
    }
  }

  async sendPhoto(channelId: string, photo: string | Buffer, caption?: string): Promise<void> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return;

    const input = typeof photo === "string" ? photo : { source: photo };

    try {
      await this.bot.telegram.sendPhoto(chatId, input, {
        caption: caption ? truncateText(caption, 1024) : undefined,
        parse_mode: "Markdown",
      });
    } catch {
      try {
        await this.bot.telegram.sendPhoto(chatId, input, {
          caption: caption ? truncateText(caption, 1024) : undefined,
        });
      } catch (err) {
        console.error("[telegram] sendPhoto failed:", err);
      }
    }
  }

  async sendDocument(channelId: string, doc: string | Buffer, filename?: string, caption?: string): Promise<void> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return;

    // String = URL or file_id — pass directly. Buffer = local file — wrap with source/filename.
    const input: string | { source: Buffer; filename?: string } = typeof doc === "string"
      ? doc
      : { source: doc, filename };

    try {
      await this.bot.telegram.sendDocument(chatId, input, {
        caption: caption ? truncateText(caption, 1024) : undefined,
        parse_mode: "Markdown",
      });
    } catch {
      try {
        await this.bot.telegram.sendDocument(chatId, input, {
          caption: caption ? truncateText(caption, 1024) : undefined,
        });
      } catch (err) {
        console.error("[telegram] sendDocument failed:", err);
      }
    }
  }

  async sendAudio(channelId: string, audio: string | Buffer, caption?: string): Promise<void> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return;

    const input = typeof audio === "string" ? audio : { source: audio };

    try {
      await this.bot.telegram.sendAudio(chatId, input, {
        caption: caption ? truncateText(caption, 1024) : undefined,
        parse_mode: "Markdown",
      });
    } catch {
      try {
        await this.bot.telegram.sendAudio(chatId, input, {
          caption: caption ? truncateText(caption, 1024) : undefined,
        });
      } catch (err) {
        console.error("[telegram] sendAudio failed:", err);
      }
    }
  }

  async sendVideo(channelId: string, video: string | Buffer, caption?: string): Promise<void> {
    const chatId = extractChannelId(channelId);
    if (!chatId) return;

    const input = typeof video === "string" ? video : { source: video };

    try {
      await this.bot.telegram.sendVideo(chatId, input, {
        caption: caption ? truncateText(caption, 1024) : undefined,
        parse_mode: "Markdown",
      });
    } catch {
      try {
        await this.bot.telegram.sendVideo(chatId, input, {
          caption: caption ? truncateText(caption, 1024) : undefined,
        });
      } catch (err) {
        console.error("[telegram] sendVideo failed:", err);
      }
    }
  }

  async start(): Promise<void> {
    const botInfo = await this.bot.telegram.getMe();
    console.log(`[telegram] Bot @${botInfo.username} authenticated`);

    if (this.config.webhook?.enabled && this.config.webhook.url) {
      try {
        await this.bot.telegram.setWebhook(this.config.webhook.url, {
          secret_token: this.config.webhook.secret,
          drop_pending_updates: false,
        });
        console.log(`[telegram] Bot started (webhook mode, URL: ${this.config.webhook.url})`);
        console.log("[telegram] Note: You need to configure your HTTP server to handle POST requests at the webhook URL");
      } catch (err) {
        console.error(`[telegram] Failed to set webhook: ${err}`);
        console.log("[telegram] Falling back to long polling");
        this.bot.launch({ dropPendingUpdates: false });
        console.log("[telegram] Bot started (long polling, will process queued messages)");
      }
    } else {
      this.bot.launch({ dropPendingUpdates: false });
      console.log("[telegram] Bot started (long polling, will process queued messages)");
    }
  }

  async stop(): Promise<void> {
    this.confirmations.clearAll();
    this.bot.stop();
    console.log("[telegram] Bot stopped");
  }
}

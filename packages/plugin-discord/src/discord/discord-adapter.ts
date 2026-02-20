import { Client, Events, GatewayIntentBits } from "discord.js";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage } from "@baseagent/gateway";
import { createStreamBuffer, createConfirmationManager, createUserGuard, truncateText, extractChannelId, type RateLimiter } from "@baseagent/gateway";

const DISCORD_MAX_LENGTH = 2000;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 8000;

export class DiscordAdapter implements ChannelAdapter {
  readonly name = "discord";
  private client: Client;
  private handleMessage: HandleMessageFn;
  private confirmations = createConfirmationManager();
  private token: string;
  private guard: (userId: string) => string | null;

  constructor(token: string, handleMessage: HandleMessageFn, allowedUserIds?: string[], rateLimiter?: RateLimiter) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });
    this.handleMessage = handleMessage;
    this.token = token;
    this.guard = createUserGuard(allowedUserIds, rateLimiter);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages (including own)
      if (message.author.bot) return;

      // Check for pending confirmation before any rate limiting --
      // approval replies are not new sessions and must never be blocked.
      if (this.confirmations.tryResolve(message.channelId, message.content)) {
        return;
      }

      // Allowlist + rate limit guard
      if (this.guard(message.author.id) !== null) return;

      // Send typing indicator immediately
      try { await message.channel.sendTyping(); } catch {}

      // Send immediate feedback
      let reply;
      try {
        reply = await message.reply("Thinking...");
      } catch {
        return;
      }

      const editMessage = async (content: string): Promise<void> => {
        try {
          await reply.edit(content);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("Unknown Message")) {
            streamBuffer.cleanup();
          }
        }
      };

      const streamBuffer = createStreamBuffer(
        { maxLength: DISCORD_MAX_LENGTH, editIntervalMs: EDIT_INTERVAL_MS },
        editMessage,
        {
          sendTyping: () => { message.channel.sendTyping().catch(() => {}); },
          typingIntervalMs: TYPING_INTERVAL_MS,
          toolStatusStyle: "asterisk",
        },
      );

      const incoming: IncomingMessage = {
        text: message.content,
        channelId: `discord:${message.channelId}`,
        userId: message.author.id,
        messageId: message.id,
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

    const channel = this.client.channels.cache.get(id);
    if (!channel || !("send" in channel)) {
      return { approved: false, reason: `Channel ${id} not found or not text-based` };
    }

    try {
      await (channel as { send: (content: string) => Promise<unknown> }).send(prompt);
    } catch (err) {
      return { approved: false, reason: `Failed to send confirmation prompt: ${err instanceof Error ? err.message : String(err)}` };
    }

    return this.confirmations.request(id, timeoutMs);
  }

  async sendMessage(channelId: string, text: string): Promise<void> {
    const id = extractChannelId(channelId);
    if (!id) return;

    const channel = this.client.channels.cache.get(id);
    if (!channel || !("send" in channel)) {
      console.error(`[discord] Channel ${id} not found or not text-based`);
      return;
    }

    const truncated = truncateText(text, DISCORD_MAX_LENGTH);

    try {
      await (channel as { send: (content: string) => Promise<unknown> }).send(truncated);
    } catch (err) {
      console.error("[discord] sendMessage failed:", err);
    }
  }

  async start(): Promise<void> {
    await this.client.login(this.token);
    await new Promise<void>((resolve) => {
      if (this.client.isReady()) {
        resolve();
      } else {
        this.client.once(Events.ClientReady, () => resolve());
      }
    });
    console.log(`[discord] Bot @${this.client.user?.username} ready`);
  }

  async stop(): Promise<void> {
    this.confirmations.clearAll();
    this.client.destroy();
    console.log("[discord] Bot stopped");
  }
}

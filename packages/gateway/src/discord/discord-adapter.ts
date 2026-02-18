import { Client, Events, GatewayIntentBits } from "discord.js";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage, StreamCallbacks } from "../adapter.js";

const DISCORD_MAX_LENGTH = 2000;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 8000;
const CONFIRMATION_TIMEOUT_MS = 60_000;

interface PendingConfirmation {
  resolve: (value: { approved: boolean; reason?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface DiscordRateLimiter {
  check(key: string): { allowed: boolean; retryAfterMs?: number };
}

export class DiscordAdapter implements ChannelAdapter {
  readonly name = "discord";
  private client: Client;
  private handleMessage: HandleMessageFn;
  private pendingConfirmations = new Map<string, PendingConfirmation>();

  private token: string;
  private allowedUserIds: Set<string> | null;
  private rateLimiter: DiscordRateLimiter | null;

  constructor(token: string, handleMessage: HandleMessageFn, allowedUserIds?: string[], rateLimiter?: DiscordRateLimiter) {
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
    this.allowedUserIds = allowedUserIds?.length ? new Set(allowedUserIds) : null;
    this.rateLimiter = rateLimiter ?? null;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages (including own)
      if (message.author.bot) return;

      // Check for pending confirmation before any rate limiting —
      // approval replies are not new sessions and must never be blocked.
      const pending = this.pendingConfirmations.get(message.channelId);
      if (pending) {
        const reply = message.content.trim().toLowerCase();
        const approved = reply === "yes" || reply === "y";
        this.pendingConfirmations.delete(message.channelId);
        clearTimeout(pending.timer);
        pending.resolve({ approved, reason: approved ? undefined : `User replied: ${message.content}` });
        return;
      }

      // Ignore messages from users not on the allowlist
      if (this.allowedUserIds && !this.allowedUserIds.has(message.author.id)) return;

      // Rate limit per user
      if (this.rateLimiter) {
        const rl = this.rateLimiter.check(message.author.id);
        if (!rl.allowed) return;
      }

      // Send typing indicator immediately
      try { await message.channel.sendTyping(); } catch {}

      // Send immediate feedback
      let reply;
      try {
        reply = await message.reply("Thinking...");
      } catch {
        // Cannot reply (permissions, deleted channel, etc.)
        return;
      }

      let buffer = "";
      let toolStatus = "";
      let editTimer: ReturnType<typeof setInterval> | null = null;
      const typingTimer = setInterval(() => {
        try { message.channel.sendTyping().catch(() => {}); } catch {}
      }, TYPING_INTERVAL_MS);
      let lastEditedText = "";
      let finished = false;

      const editMessage = async (): Promise<void> => {
        const display = toolStatus
          ? `${buffer}\n\n*${toolStatus}*`
          : buffer;

        const truncated = display.length > DISCORD_MAX_LENGTH
          ? display.slice(0, DISCORD_MAX_LENGTH - 4) + "..."
          : display;

        if (!truncated || truncated === lastEditedText) return;

        try {
          await reply.edit(truncated);
          lastEditedText = truncated;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // Silently ignore "Unknown Message" errors (message was deleted)
          if (msg.includes("Unknown Message")) {
            finished = true;
            if (editTimer) clearInterval(editTimer);
          }
        }
      };

      const incoming: IncomingMessage = {
        text: message.content,
        channelId: `discord:${message.channelId}`,
        userId: message.author.id,
        messageId: message.id,
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

  async requestConfirmation(channelId: string, prompt: string, timeoutMs?: number): Promise<{ approved: boolean; reason?: string }> {
    const id = channelId.split(":")[1];
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

    const channel = this.client.channels.cache.get(id);
    if (!channel || !("send" in channel)) {
      console.error(`[discord] Channel ${id} not found or not text-based`);
      return;
    }

    const truncated = text.length > DISCORD_MAX_LENGTH
      ? text.slice(0, DISCORD_MAX_LENGTH - 4) + "..."
      : text;

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
    this.client.destroy();
    console.log("[discord] Bot stopped");
  }
}

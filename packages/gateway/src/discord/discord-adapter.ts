import { Client, Events, GatewayIntentBits } from "discord.js";
import type { ChannelAdapter, HandleMessageFn, IncomingMessage, StreamCallbacks } from "../adapter.js";

const DISCORD_MAX_LENGTH = 2000;
const EDIT_INTERVAL_MS = 500;
const TYPING_INTERVAL_MS = 8000;

export class DiscordAdapter implements ChannelAdapter {
  readonly name = "discord";
  private client: Client;
  private handleMessage: HandleMessageFn;

  constructor(token: string, handleMessage: HandleMessageFn) {
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
    this.setupHandlers();
  }

  private token: string;

  private setupHandlers(): void {
    this.client.on(Events.MessageCreate, async (message) => {
      // Ignore bot messages (including own)
      if (message.author.bot) return;

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

// @baseagent/gateway — Channel adapters, message routing
export type {
  ChannelAdapter,
  HandleMessageFn,
  StreamCallbacks,
  IncomingMessage,
} from "./adapter.js";
export { TelegramAdapter } from "./telegram/telegram-adapter.js";
export { DiscordAdapter } from "./discord/discord-adapter.js";
export { createQueuedHandler } from "./queue.js";

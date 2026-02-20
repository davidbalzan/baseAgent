// @baseagent/gateway — Shared adapter types, utilities, message routing

// Core types
export type {
  ChannelAdapter,
  HandleMessageFn,
  StreamCallbacks,
  IncomingMessage,
} from "./adapter.js";

// Message queue + proactive routing
export { createQueuedHandler } from "./queue.js";
export { createProactiveMessenger, type SendProactiveMessageFn } from "./proactive.js";

// Shared utilities
export { createStreamBuffer } from "./stream-buffer.js";
export type { StreamBufferConfig, StreamBufferHandle, StreamBufferOptions, EditMessageFn } from "./stream-buffer.js";
export { createConfirmationManager } from "./confirmation-manager.js";
export type { ConfirmationManager } from "./confirmation-manager.js";
export { createUserGuard } from "./user-guard.js";
export type { RateLimiter } from "./user-guard.js";
export { truncateText, extractChannelId } from "./text-utils.js";

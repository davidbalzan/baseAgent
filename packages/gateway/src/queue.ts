import type { HandleMessageFn, IncomingMessage, StreamCallbacks } from "./adapter.js";

/** Default safety timeout: 5 minutes. Protects against hung model calls. */
const DEFAULT_HANDLER_TIMEOUT_MS = 5 * 60 * 1000;

interface QueueEntry {
  message: IncomingMessage;
  stream: StreamCallbacks;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export interface QueuedHandlerOptions {
  /** Maximum time (ms) a handler may run before it is force-resolved.
   *  Prevents a hung model call from permanently blocking the channel queue.
   *  Default: 300 000 (5 min). */
  handlerTimeoutMs?: number;
}

export function createQueuedHandler(
  handler: HandleMessageFn,
  options?: QueuedHandlerOptions,
): HandleMessageFn {
  const handlerTimeoutMs = options?.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
  const queues = new Map<string, QueueEntry[]>();
  const processing = new Set<string>();

  async function processQueue(channelId: string): Promise<void> {
    if (processing.has(channelId)) return;

    const queue = queues.get(channelId);
    if (!queue || queue.length === 0) {
      queues.delete(channelId);
      return;
    }

    processing.add(channelId);
    const entry = queue.shift()!;

    try {
      // Safety timeout: if the handler hangs (e.g. model call ignores abort signal),
      // force-resolve after handlerTimeoutMs so the channel queue isn't blocked forever.
      await Promise.race([
        handler(entry.message, entry.stream),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Queue handler timed out after ${handlerTimeoutMs}ms`)),
            handlerTimeoutMs,
          ),
        ),
      ]);
      entry.resolve();
    } catch (err) {
      entry.reject(err);
    } finally {
      processing.delete(channelId);
      await processQueue(channelId);
    }
  }

  return (message, stream) => {
    return new Promise<void>((resolve, reject) => {
      const channelId = message.channelId;

      if (!queues.has(channelId)) {
        queues.set(channelId, []);
      }

      queues.get(channelId)!.push({ message, stream, resolve, reject });
      processQueue(channelId);
    });
  };
}

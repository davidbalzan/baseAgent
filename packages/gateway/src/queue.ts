import type { HandleMessageFn, IncomingMessage, StreamCallbacks } from "./adapter.js";

interface QueueEntry {
  message: IncomingMessage;
  stream: StreamCallbacks;
  resolve: () => void;
  reject: (err: unknown) => void;
}

export function createQueuedHandler(handler: HandleMessageFn): HandleMessageFn {
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
      await handler(entry.message, entry.stream);
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

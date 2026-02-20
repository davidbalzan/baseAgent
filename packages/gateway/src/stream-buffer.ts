import type { StreamCallbacks } from "./adapter.js";

export interface StreamBufferConfig {
  maxLength: number;
  editIntervalMs: number;
}

export interface EditMessageFn {
  (text: string): Promise<void>;
}

export interface StreamBufferOptions {
  /** Called periodically to send typing indicators. */
  sendTyping?: () => void;
  /** Interval in ms for typing indicators (default: none). */
  typingIntervalMs?: number;
  /** Italicize tool status. "underscore" for _text_, "asterisk" for *text*. Default: "underscore". */
  toolStatusStyle?: "underscore" | "asterisk";
}

export interface StreamBufferHandle {
  callbacks: StreamCallbacks;
  start(): void;
  cleanup(): void;
}

/**
 * Creates a stream buffer that accumulates text deltas and tool statuses,
 * then periodically calls editMessage with the current buffer content.
 */
export function createStreamBuffer(
  config: StreamBufferConfig,
  editMessage: EditMessageFn,
  opts?: StreamBufferOptions,
): StreamBufferHandle {
  let buffer = "";
  let toolStatus = "";
  let editTimer: ReturnType<typeof setInterval> | null = null;
  let typingTimer: ReturnType<typeof setInterval> | null = null;
  let lastEditedText = "";
  let finished = false;

  const styleChar = opts?.toolStatusStyle === "asterisk" ? "*" : "_";

  async function doEdit(): Promise<void> {
    const display = toolStatus
      ? `${buffer}\n\n${styleChar}${toolStatus}${styleChar}`
      : buffer;

    const truncated = display.length > config.maxLength
      ? display.slice(0, config.maxLength - 3) + "..."
      : display;

    if (!truncated || truncated === lastEditedText) return;

    try {
      await editMessage(truncated);
      lastEditedText = truncated;
    } catch {
      // Silently ignore edit errors (rate limits, deleted message, etc.)
    }
  }

  const callbacks: StreamCallbacks = {
    onTextDelta: (delta) => {
      buffer += delta;
    },
    onTextReset: () => {
      buffer = "";
      toolStatus = "";
    },
    onToolCall: (toolName) => {
      toolStatus = `Using ${toolName}...`;
    },
    onFinish: async (output) => {
      finished = true;
      if (editTimer) clearInterval(editTimer);
      if (typingTimer) clearInterval(typingTimer);
      buffer = output || buffer;
      toolStatus = "";
      await doEdit();
    },
    onError: async (error) => {
      finished = true;
      if (editTimer) clearInterval(editTimer);
      if (typingTimer) clearInterval(typingTimer);
      buffer = `Error: ${error.message}`;
      toolStatus = "";
      await doEdit();
    },
  };

  return {
    callbacks,
    start() {
      editTimer = setInterval(() => {
        if (!finished) {
          doEdit();
        }
      }, config.editIntervalMs);

      if (opts?.sendTyping && opts.typingIntervalMs) {
        opts.sendTyping();
        typingTimer = setInterval(() => {
          if (!finished) {
            opts.sendTyping!();
          }
        }, opts.typingIntervalMs);
      }
    },
    cleanup() {
      finished = true;
      if (editTimer) clearInterval(editTimer);
      if (typingTimer) clearInterval(typingTimer);
    },
  };
}

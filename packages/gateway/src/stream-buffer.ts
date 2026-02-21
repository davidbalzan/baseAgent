import type { StreamCallbacks } from "./adapter.js";

// ─── Friendly tool name map ──────────────────────────────────────

const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  shell_exec: "Running command",
  file_read: "Reading file",
  file_write: "Writing file",
  file_edit: "Editing file",
  file_list: "Browsing files",
  web_fetch: "Fetching page",
  web_search: "Searching web",
  memory_read: "Reading memory",
  memory_write: "Saving to memory",
  think: "Reasoning",
  finish: "Finishing up",
  session_search: "Searching sessions",
  review_sessions: "Reviewing sessions",
  schedule_task: "Scheduling task",
  list_scheduled_tasks: "Listing tasks",
  cancel_scheduled_task: "Cancelling task",
  install_plugin: "Installing plugin",
  remove_plugin: "Removing plugin",
  list_plugins: "Listing plugins",
  add_mcp_server: "Adding MCP server",
  pnpm_install: "Installing package",
};

function friendlyToolName(raw: string): string {
  if (FRIENDLY_TOOL_NAMES[raw]) return FRIENDLY_TOOL_NAMES[raw];
  // Fallback: replace underscores and capitalize first letter
  const label = raw.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

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
  let toolCallCount = 0;
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
      // Pseudo-status from bootstrap progress timer (e.g. "thinking", "working (step 2)")
      if (toolName === "thinking" || toolName.startsWith("working")) {
        toolStatus = toolName.charAt(0).toUpperCase() + toolName.slice(1) + "...";
        return;
      }
      toolCallCount += 1;
      toolStatus = `Step ${toolCallCount} \u00b7 ${friendlyToolName(toolName)}...`;
    },
    onToolResult: (toolName, success, error) => {
      const label = friendlyToolName(toolName);
      toolStatus = success
        ? `\u2713 ${label}`
        : `\u2717 ${label}${error ? `: ${error.slice(0, 80)}` : ""}`;
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

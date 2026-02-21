import type { ChannelAdapter, HandleMessageFn, IncomingMessage, StreamCallbacks } from "@baseagent/gateway";
import { createConfirmationManager } from "@baseagent/gateway";
import type { ChatBus } from "./chat-bus.js";

const CHANNEL_ID = "dashboard:web";

export class ChatAdapter implements ChannelAdapter {
  readonly name = "dashboard";
  private readonly handleMessage: HandleMessageFn;
  private readonly bus: ChatBus;
  private readonly confirmations = createConfirmationManager();
  private messageCounter = 0;

  constructor(handleMessage: HandleMessageFn, bus: ChatBus) {
    this.handleMessage = handleMessage;
    this.bus = bus;
  }

  /** Called by POST /chat/send — routes text through the agent. */
  handleIncoming(text: string): void {
    // Check for pending governance confirmation first
    if (this.confirmations.tryResolve(CHANNEL_ID, text)) {
      return;
    }

    const incoming: IncomingMessage = {
      text,
      channelId: CHANNEL_ID,
      userId: "web",
      messageId: String(++this.messageCounter),
    };

    const stream: StreamCallbacks = {
      onSessionStart: (sessionId) => this.bus.emit({ type: "session_started", sessionId }),
      onTextDelta: (delta) => this.bus.emit({ type: "text_delta", delta }),
      onTextReset: () => this.bus.emit({ type: "text_reset" }),
      onToolCall: (toolName) => this.bus.emit({ type: "tool_call", toolName }),
      onToolResult: (toolName, success, error) => this.bus.emit({ type: "tool_result", toolName, success, error }),
      onFinish: (output, meta) => this.bus.emit({ type: "finish", output, sessionId: meta?.sessionId }),
      onError: (error) => this.bus.emit({ type: "error", message: error.message }),
    };

    // Fire-and-forget — same pattern as Telegram adapter
    this.handleMessage(incoming, stream).catch((err) => {
      stream.onError(err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Proactive outbound messages (scheduler, heartbeat). */
  async sendMessage(_channelId: string, text: string): Promise<void> {
    this.bus.emit({ type: "proactive", text });
  }

  /** Governance confirmation — emits prompt to browser, waits for reply. */
  async requestConfirmation(
    _channelId: string,
    prompt: string,
    timeoutMs?: number,
  ): Promise<{ approved: boolean; reason?: string }> {
    this.bus.emit({ type: "confirmation", prompt });
    return this.confirmations.request(CHANNEL_ID, timeoutMs);
  }

  async start(): Promise<void> {
    // No external service to connect to
  }

  async stop(): Promise<void> {
    this.confirmations.clearAll();
  }
}

/** Events emitted on the ChatBus for SSE streaming to the browser. */
export type ChatEvent =
  | { type: "session_started"; sessionId: string }
  | { type: "text_delta"; delta: string }
  | { type: "text_reset" }
  | { type: "tool_call"; toolName: string }
  | { type: "tool_result"; toolName: string; success: boolean; error?: string }
  | { type: "finish"; output: string; sessionId?: string }
  | { type: "error"; message: string }
  | { type: "confirmation"; prompt: string }
  | { type: "proactive"; text: string };

type Subscriber = (event: ChatEvent) => void;

/**
 * In-process pub/sub bus that bridges the ChatAdapter to SSE clients.
 * Same pattern as LiveSessionBus — simple, synchronous fan-out.
 */
export class ChatBus {
  private readonly subs = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  emit(event: ChatEvent): void {
    for (const fn of this.subs) {
      try { fn(event); } catch { /* ignore broken pipes */ }
    }
  }

  get clientCount(): number { return this.subs.size; }
}

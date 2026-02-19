import type { TraceEvent } from "@baseagent/core";

/** Events broadcast to all connected SSE clients. */
export type LiveEvent =
  | { type: "session_started"; sessionId: string; channelId?: string; input: string; ts: string }
  | {
      type: "trace_event";
      sessionId: string;
      phase: TraceEvent["phase"];
      iteration: number;
      data: Record<string, unknown> | undefined;
      promptTokens?: number;
      completionTokens?: number;
      ts: string;
    }
  | { type: "session_completed"; sessionId: string; status: string; ts: string };

type Subscriber = (event: LiveEvent) => void;

/**
 * In-process pub/sub bus that bridges running agent sessions to SSE clients.
 * runSession emits events here; the /api/live SSE endpoint forwards them to browsers.
 */
export class LiveSessionBus {
  private readonly subs = new Set<Subscriber>();

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  emit(event: LiveEvent): void {
    for (const fn of this.subs) {
      try { fn(event); } catch { /* ignore broken pipes */ }
    }
  }

  get clientCount(): number { return this.subs.size; }
}

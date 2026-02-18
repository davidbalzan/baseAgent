import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { traces } from "../db/schema.js";
import type { TraceEvent } from "@baseagent/core";

export class TraceRepository {
  constructor(private db: AppDatabase) {}

  insert(event: TraceEvent) {
    this.db.insert(traces).values({
      id: event.id,
      sessionId: event.sessionId,
      phase: event.phase,
      iteration: event.iteration,
      data: event.data ? JSON.stringify(event.data) : null,
      promptTokens: event.promptTokens ?? null,
      completionTokens: event.completionTokens ?? null,
      costUsd: event.costUsd ?? null,
      timestamp: event.timestamp,
    }).run();
  }

  findBySession(sessionId: string) {
    return this.db
      .select()
      .from(traces)
      .where(eq(traces.sessionId, sessionId))
      .all();
  }
}

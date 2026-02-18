import { randomUUID } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { messages } from "../db/schema.js";

export interface SerializedMessage {
  role: string;
  content: string;
  iteration: number;
  position: number;
}

export class MessageRepository {
  constructor(private db: AppDatabase) {}

  saveSessionMessages(
    sessionId: string,
    msgs: Array<{ role: string; content: unknown }>,
    iterationMap: Map<number, number>,
  ): void {
    this.db.transaction((tx) => {
      tx.delete(messages).where(eq(messages.sessionId, sessionId)).run();

      const now = new Date().toISOString();

      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        tx.insert(messages)
          .values({
            id: randomUUID(),
            sessionId,
            role: msg.role,
            content,
            iteration: iterationMap.get(i) ?? 0,
            position: i,
            timestamp: now,
          })
          .run();
      }
    });
  }

  loadSessionMessages(sessionId: string): SerializedMessage[] {
    const rows = this.db
      .select({
        role: messages.role,
        content: messages.content,
        iteration: messages.iteration,
        position: messages.position,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.position))
      .all();

    return rows;
  }
}

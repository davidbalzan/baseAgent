import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { sessions } from "../db/schema.js";

export interface CreateSessionInput {
  input: string;
  channelId?: string;
}

export class SessionRepository {
  constructor(private db: AppDatabase) {}

  create(data: CreateSessionInput) {
    const now = new Date().toISOString();
    const id = randomUUID();

    this.db.insert(sessions).values({
      id,
      status: "pending",
      channelId: data.channelId ?? null,
      input: data.input,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
      iterations: 0,
      createdAt: now,
      updatedAt: now,
    }).run();

    return { id, status: "pending" as const, createdAt: now };
  }

  findById(id: string) {
    return this.db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  updateStatus(id: string, status: string, output?: string) {
    const now = new Date().toISOString();
    this.db
      .update(sessions)
      .set({ status, output: output ?? null, updatedAt: now })
      .where(eq(sessions.id, id))
      .run();
  }

  updateUsage(
    id: string,
    usage: {
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      totalCostUsd: number;
      iterations: number;
    },
  ) {
    const now = new Date().toISOString();
    this.db
      .update(sessions)
      .set({ ...usage, updatedAt: now })
      .where(eq(sessions.id, id))
      .run();
  }

  listRecent(limit = 20) {
    return this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .all();
  }
}

import { randomUUID } from "node:crypto";
import { eq, desc, sql, and, isNotNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import { sessions } from "../db/schema.js";

export interface CostAggregates {
  totals: { sessions: number; cost: number; tokens: number; promptTokens: number; completionTokens: number };
  daily: { date: string; sessions: number; cost: number; tokens: number }[];
  byChannel: { channel: string; sessions: number; cost: number; tokens: number }[];
  byModel: { model: string; sessions: number; cost: number; tokens: number }[];
  byStatus: { status: string; sessions: number; cost: number }[];
  topSessions: { id: string; input: string; cost: number; tokens: number; status: string; channelId: string | null; createdAt: string }[];
}

export interface CreateSessionInput {
  input: string;
  channelId?: string;
  model?: string;
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
      model: data.model ?? null,
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

  findRecentByChannelId(channelId: string, limit = 200) {
    return this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.channelId, channelId),
          eq(sessions.status, "completed"),
          isNotNull(sessions.output),
        ),
      )
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .all();
  }

  getCostAggregates(): CostAggregates {
    const totals = this.db.get<{
      sessions: number; cost: number; tokens: number; promptTokens: number; completionTokens: number;
    }>(sql`
      SELECT
        COUNT(*) as sessions,
        COALESCE(SUM(total_cost_usd), 0) as cost,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(prompt_tokens), 0) as "promptTokens",
        COALESCE(SUM(completion_tokens), 0) as "completionTokens"
      FROM sessions
    `) ?? { sessions: 0, cost: 0, tokens: 0, promptTokens: 0, completionTokens: 0 };

    const daily = this.db.all<{
      date: string; sessions: number; cost: number; tokens: number;
    }>(sql`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as sessions,
        COALESCE(SUM(total_cost_usd), 0) as cost,
        COALESCE(SUM(total_tokens), 0) as tokens
      FROM sessions
      WHERE created_at >= DATE('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    const byChannel = this.db.all<{
      channel: string; sessions: number; cost: number; tokens: number;
    }>(sql`
      SELECT
        COALESCE(channel_id, 'unknown') as channel,
        COUNT(*) as sessions,
        COALESCE(SUM(total_cost_usd), 0) as cost,
        COALESCE(SUM(total_tokens), 0) as tokens
      FROM sessions
      GROUP BY channel_id
      ORDER BY cost DESC
    `);

    const byModel = this.db.all<{
      model: string; sessions: number; cost: number; tokens: number;
    }>(sql`
      SELECT
        COALESCE(model, 'unknown') as model,
        COUNT(*) as sessions,
        COALESCE(SUM(total_cost_usd), 0) as cost,
        COALESCE(SUM(total_tokens), 0) as tokens
      FROM sessions
      GROUP BY model
      ORDER BY cost DESC
    `);

    const byStatus = this.db.all<{
      status: string; sessions: number; cost: number;
    }>(sql`
      SELECT
        status,
        COUNT(*) as sessions,
        COALESCE(SUM(total_cost_usd), 0) as cost
      FROM sessions
      GROUP BY status
      ORDER BY cost DESC
    `);

    const topSessions = this.db.all<{
      id: string; input: string; cost: number; tokens: number; status: string; channelId: string | null; createdAt: string;
    }>(sql`
      SELECT
        id,
        input,
        total_cost_usd as cost,
        total_tokens as tokens,
        status,
        channel_id as "channelId",
        created_at as "createdAt"
      FROM sessions
      ORDER BY total_cost_usd DESC
      LIMIT 10
    `);

    return { totals, daily, byChannel, byModel, byStatus, topSessions };
  }
}

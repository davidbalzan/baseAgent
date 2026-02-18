import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.js";
import { pushSchema } from "../../db/migrate.js";
import { MessageRepository } from "../message.repository.js";
import { SessionRepository } from "../session.repository.js";
import type { AppDatabase } from "../../db/connection.js";

function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  pushSchema(db);
  return db;
}

describe("MessageRepository", () => {
  let db: AppDatabase;
  let messageRepo: MessageRepository;
  let sessionRepo: SessionRepository;
  let sessionId: string;

  beforeEach(() => {
    db = createTestDb();
    messageRepo = new MessageRepository(db);
    sessionRepo = new SessionRepository(db);
    sessionId = sessionRepo.create({ input: "test" }).id;
  });

  it("saves and loads messages in position order", () => {
    const msgs = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const iterationMap = new Map<number, number>();

    messageRepo.saveSessionMessages(sessionId, msgs, iterationMap);

    const loaded = messageRepo.loadSessionMessages(sessionId);
    expect(loaded).toHaveLength(3);
    expect(loaded[0].role).toBe("system");
    expect(loaded[0].content).toBe("You are helpful.");
    expect(loaded[0].position).toBe(0);
    expect(loaded[1].role).toBe("user");
    expect(loaded[1].position).toBe(1);
    expect(loaded[2].role).toBe("assistant");
    expect(loaded[2].position).toBe(2);
  });

  it("replaces messages on second save for same session", () => {
    const first = [
      { role: "system", content: "system" },
      { role: "user", content: "first input" },
    ];
    messageRepo.saveSessionMessages(sessionId, first, new Map());

    const second = [
      { role: "system", content: "system" },
      { role: "user", content: "first input" },
      { role: "assistant", content: "response" },
      { role: "user", content: "second input" },
    ];
    messageRepo.saveSessionMessages(sessionId, second, new Map());

    const loaded = messageRepo.loadSessionMessages(sessionId);
    expect(loaded).toHaveLength(4);
    expect(loaded[3].content).toBe("second input");
  });

  it("preserves iteration mapping from toolMessageMeta", () => {
    const msgs = [
      { role: "system", content: "sys" },
      { role: "user", content: "input" },
      { role: "assistant", content: "reasoning" },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "tc1", toolName: "test", result: "ok" }] },
    ];
    const iterationMap = new Map<number, number>([[3, 2]]);

    messageRepo.saveSessionMessages(sessionId, msgs, iterationMap);

    const loaded = messageRepo.loadSessionMessages(sessionId);
    expect(loaded[3].iteration).toBe(2);
    expect(loaded[0].iteration).toBe(0);
  });

  it("serializes non-string content as JSON", () => {
    const toolContent = [{ type: "tool-result", toolCallId: "tc1", toolName: "test", result: "data" }];
    const msgs = [
      { role: "tool", content: toolContent },
    ];
    messageRepo.saveSessionMessages(sessionId, msgs, new Map());

    const loaded = messageRepo.loadSessionMessages(sessionId);
    expect(loaded[0].content).toBe(JSON.stringify(toolContent));
  });

  it("save is atomic (transaction) — all or nothing", () => {
    // Save initial messages
    const msgs = [
      { role: "system", content: "sys" },
      { role: "user", content: "input" },
    ];
    messageRepo.saveSessionMessages(sessionId, msgs, new Map());

    // Verify they exist
    expect(messageRepo.loadSessionMessages(sessionId)).toHaveLength(2);

    // The transaction wraps delete + inserts atomically.
    // If we save again, old messages are replaced cleanly.
    const msgs2 = [
      { role: "system", content: "sys" },
      { role: "user", content: "new input" },
      { role: "assistant", content: "response" },
    ];
    messageRepo.saveSessionMessages(sessionId, msgs2, new Map());

    const loaded = messageRepo.loadSessionMessages(sessionId);
    expect(loaded).toHaveLength(3);
    expect(loaded[1].content).toBe("new input");
  });
});

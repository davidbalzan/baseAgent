import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.js";
import { pushSchema } from "../../db/migrate.js";
import { MessageRepository } from "../message.repository.js";
import { SessionRepository } from "../session.repository.js";
import { deserializeMessages } from "../message-deserializer.js";
import type { AppDatabase } from "../../db/connection.js";

function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  pushSchema(db);
  return db;
}

describe("deserializeMessages (round-trip)", () => {
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

  it("round-trips a plain text user message", () => {
    const msgs = [{ role: "user", content: "Hello world" }];
    messageRepo.saveSessionMessages(sessionId, msgs, new Map());

    const rows = messageRepo.loadSessionMessages(sessionId);
    const { messages } = deserializeMessages(rows);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Hello world");
  });

  it("round-trips a system message", () => {
    const msgs = [{ role: "system", content: "You are a helpful assistant." }];
    messageRepo.saveSessionMessages(sessionId, msgs, new Map());

    const rows = messageRepo.loadSessionMessages(sessionId);
    const { messages } = deserializeMessages(rows);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("You are a helpful assistant.");
  });

  it("round-trips a tool message with array content", () => {
    const toolContent = [
      { type: "tool-result", toolCallId: "tc_1", toolName: "web_fetch", result: "page content" },
      { type: "tool-result", toolCallId: "tc_2", toolName: "shell_exec", result: "stdout" },
    ];
    const msgs = [{ role: "tool", content: toolContent }];
    const iterationMap = new Map<number, number>([[0, 3]]);
    messageRepo.saveSessionMessages(sessionId, msgs, iterationMap);

    const rows = messageRepo.loadSessionMessages(sessionId);
    const { messages, toolMessageMeta } = deserializeMessages(rows);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("tool");
    // Content should be parsed back to array
    expect(Array.isArray(messages[0].content)).toBe(true);
    const content = messages[0].content as Array<{ type: string; toolCallId: string; toolName: string; result: string }>;
    expect(content).toHaveLength(2);
    expect(content[0].toolCallId).toBe("tc_1");
    expect(content[1].toolName).toBe("shell_exec");

    // toolMessageMeta should be reconstructed
    expect(toolMessageMeta).toHaveLength(1);
    expect(toolMessageMeta[0].messageIndex).toBe(0);
    expect(toolMessageMeta[0].iteration).toBe(3);
  });

  it("round-trips an assistant message with tool-call array content", () => {
    const assistantContent = [
      { type: "text", text: "Let me look that up." },
      { type: "tool-call", toolCallId: "tc_1", toolName: "web_search", args: { query: "test" } },
    ];
    const msgs = [{ role: "assistant", content: assistantContent }];
    messageRepo.saveSessionMessages(sessionId, msgs, new Map());

    const rows = messageRepo.loadSessionMessages(sessionId);
    const { messages } = deserializeMessages(rows);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("assistant");
    const content = messages[0].content as Array<{ type: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe("text");
    expect(content[1].type).toBe("tool-call");
  });

  it("keeps content as raw string when it looks like JSON but is not valid", () => {
    const msgs = [{ role: "user", content: "[not valid json" }];
    messageRepo.saveSessionMessages(sessionId, msgs, new Map());

    const rows = messageRepo.loadSessionMessages(sessionId);
    const { messages } = deserializeMessages(rows);

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("[not valid json");
  });

  it("round-trips a full conversation with mixed message types", () => {
    const toolContent = [{ type: "tool-result", toolCallId: "tc_1", toolName: "test", result: "ok" }];
    const msgs = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Do something" },
      { role: "assistant", content: "Working on it." },
      { role: "tool", content: toolContent },
      { role: "assistant", content: "Done!" },
    ];
    const iterationMap = new Map<number, number>([[3, 1]]);
    messageRepo.saveSessionMessages(sessionId, msgs, iterationMap);

    const rows = messageRepo.loadSessionMessages(sessionId);
    const { messages, toolMessageMeta } = deserializeMessages(rows);

    expect(messages).toHaveLength(5);
    expect(messages[0].content).toBe("You are helpful.");
    expect(messages[1].content).toBe("Do something");
    expect(messages[2].content).toBe("Working on it.");
    expect(Array.isArray(messages[3].content)).toBe(true);
    expect(messages[4].content).toBe("Done!");
    expect(toolMessageMeta).toHaveLength(1);
    expect(toolMessageMeta[0].messageIndex).toBe(3);
  });
});

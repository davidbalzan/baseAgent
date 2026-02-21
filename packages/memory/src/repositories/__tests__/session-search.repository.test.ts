import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "../../db/schema.js";
import { pushSchema } from "../../db/migrate.js";
import { SessionRepository } from "../session.repository.js";
import type { AppDatabase } from "../../db/connection.js";

function createTestDb(): AppDatabase {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  pushSchema(db);
  return db;
}

function createCompletedSession(
  repo: SessionRepository,
  input: string,
  output: string,
  opts?: { channelId?: string },
) {
  const { id } = repo.create({ input, channelId: opts?.channelId });
  repo.updateStatus(id, "completed", output);
  return id;
}

describe("SessionRepository.searchByKeyword", () => {
  let db: AppDatabase;
  let repo: SessionRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SessionRepository(db);
  });

  it("finds sessions matching input text", () => {
    createCompletedSession(repo, "show me a cat picture", "Here is a cat.");
    createCompletedSession(repo, "what is the weather", "It is sunny.");

    const results = repo.searchByKeyword("cat");
    expect(results).toHaveLength(1);
    expect(results[0].input).toContain("cat");
  });

  it("finds sessions matching output text", () => {
    createCompletedSession(repo, "hello", "I can help with Python programming.");

    const results = repo.searchByKeyword("Python");
    expect(results).toHaveLength(1);
    expect(results[0].output).toContain("Python");
  });

  it("returns empty array when no matches", () => {
    createCompletedSession(repo, "hello", "hi there");
    expect(repo.searchByKeyword("nonexistent")).toHaveLength(0);
  });

  it("excludes non-completed sessions", () => {
    const { id } = repo.create({ input: "pending cat session" });
    // leave as pending — don't call updateStatus
    void id;

    expect(repo.searchByKeyword("cat")).toHaveLength(0);
  });

  it("filters by channelId", () => {
    createCompletedSession(repo, "cat in telegram", "meow", { channelId: "telegram:123" });
    createCompletedSession(repo, "cat in discord", "meow", { channelId: "discord:456" });

    const results = repo.searchByKeyword("cat", { channelId: "telegram:123" });
    expect(results).toHaveLength(1);
    expect(results[0].channelId).toBe("telegram:123");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      createCompletedSession(repo, `cat session ${i}`, `response ${i}`);
    }

    const results = repo.searchByKeyword("cat", { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("clamps limit to max 50", () => {
    // Just verify it doesn't throw with limit > 50
    const results = repo.searchByKeyword("anything", { limit: 100 });
    expect(results).toHaveLength(0);
  });

  it("escapes LIKE wildcards in query", () => {
    createCompletedSession(repo, "100% complete", "done");
    createCompletedSession(repo, "fully complete", "done");

    // "100%" should only match the literal "100%", not act as "100" + wildcard
    const results = repo.searchByKeyword("100%");
    expect(results).toHaveLength(1);
    expect(results[0].input).toBe("100% complete");
  });

  it("escapes underscore wildcard in query", () => {
    createCompletedSession(repo, "file_name.txt", "found it");
    createCompletedSession(repo, "filename.txt", "found it");

    // "file_name" should match literal underscore, not any single char
    const results = repo.searchByKeyword("file_name");
    expect(results).toHaveLength(1);
    expect(results[0].input).toContain("file_name");
  });

  it("returns results ordered by createdAt descending", () => {
    // Insert with explicit timestamps to guarantee ordering
    // Use relative dates from now to stay within the default 30-day window
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

    const id1 = createCompletedSession(repo, "first cat", "meow 1");
    const id2 = createCompletedSession(repo, "second cat", "meow 2");

    // Force distinct timestamps (create() uses Date.now() which can collide)
    db.run(sql`UPDATE sessions SET created_at = ${twoDaysAgo} WHERE id = ${id1}`);
    db.run(sql`UPDATE sessions SET created_at = ${oneDayAgo} WHERE id = ${id2}`);

    const results = repo.searchByKeyword("cat");
    expect(results).toHaveLength(2);
    // Most recent first
    expect(results[0].input).toBe("second cat");
    expect(results[1].input).toBe("first cat");
  });
});

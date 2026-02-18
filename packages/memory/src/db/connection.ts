import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

let db: BetterSQLite3Database<typeof schema> | null = null;
let sqlite: Database.Database | null = null;

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export function initDatabase(path: string): AppDatabase {
  if (db) return db;

  sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });
  return db;
}

export function getDatabase(): AppDatabase {
  if (!db) throw new Error("Database not initialized. Call initDatabase() first.");
  return db;
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

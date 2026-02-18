import type { AppDatabase } from "./connection.js";

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  channel_id TEXT,
  input TEXT NOT NULL,
  output TEXT,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  iterations INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  error TEXT,
  duration_ms INTEGER,
  iteration INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  phase TEXT NOT NULL,
  iteration INTEGER NOT NULL,
  data TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  timestamp TEXT NOT NULL
);
`;

export function pushSchema(db: AppDatabase): void {
  // Execute raw SQL through the underlying better-sqlite3 driver
  // Drizzle exposes .run() for raw SQL execution
  const statements = CREATE_TABLES_SQL.trim().split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    db.run(/* sql */ `${stmt.trim()}`);
  }
}

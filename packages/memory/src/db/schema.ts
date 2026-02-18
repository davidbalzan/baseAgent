import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("pending"),
  channelId: text("channel_id"),
  input: text("input").notNull(),
  output: text("output"),
  totalTokens: integer("total_tokens").notNull().default(0),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  iterations: integer("iterations").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  iteration: integer("iteration").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const toolExecutions = sqliteTable("tool_executions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  toolCallId: text("tool_call_id").notNull(),
  toolName: text("tool_name").notNull(),
  input: text("input").notNull(),
  output: text("output"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  iteration: integer("iteration").notNull(),
  timestamp: text("timestamp").notNull(),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  phase: text("phase").notNull(),
  iteration: integer("iteration").notNull(),
  data: text("data"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  costUsd: real("cost_usd"),
  timestamp: text("timestamp").notNull(),
});

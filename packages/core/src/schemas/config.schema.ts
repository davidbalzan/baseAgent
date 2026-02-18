import { z } from "zod";

// Helper: accept string, null, or undefined — coerce null/empty to undefined
const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : undefined));

const LlmProviderSchema = z.enum(["openrouter", "anthropic", "openai", "ollama"]);

const ProviderOverridesSchema = z.object({
  anthropic: z.object({ apiKey: optionalString }).optional(),
  openai: z.object({ apiKey: optionalString }).optional(),
  ollama: z.object({ baseUrl: optionalString }).optional(),
});

const LlmConfigSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
  apiKey: optionalString,
  providers: ProviderOverridesSchema.optional(),
});

const ChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: optionalString,
});

const ChannelsConfigSchema = z.object({
  telegram: ChannelConfigSchema.optional(),
  discord: ChannelConfigSchema.optional(),
});

const AgentConfigSchema = z.object({
  maxIterations: z.number().int().positive().default(10),
  timeoutMs: z.number().int().positive().default(120_000),
  costCapUsd: z.number().positive().default(1.0),
});

const MemoryConfigSchema = z.object({
  compactionThreshold: z.number().int().positive().default(4000),
  maxTokenBudget: z.number().int().positive().default(8000),
  toolOutputDecayIterations: z.number().int().positive().default(3),
  toolOutputDecayThresholdChars: z.number().int().positive().default(500),
});

const HeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z.number().int().positive().default(1_800_000), // 30 min
  channelId: optionalString, // e.g., "telegram:12345"
});

const ServerConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
});

export const AppConfigSchema = z.object({
  llm: LlmConfigSchema,
  channels: ChannelsConfigSchema.optional(),
  agent: AgentConfigSchema,
  memory: MemoryConfigSchema,
  heartbeat: HeartbeatConfigSchema.optional(),
  server: ServerConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

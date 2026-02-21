import { z } from "zod";
import { ToolPermissionSchema } from "./tool.schema.js";

// Helper: accept string, null, or undefined — coerce null/empty to undefined
const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : undefined));

const LlmProviderSchema = z.enum(["openrouter", "anthropic", "openai", "ollama", "lm-studio"]);

const ProviderOverridesSchema = z.object({
  anthropic: z.object({ apiKey: optionalString }).optional(),
  openai: z.object({ apiKey: optionalString }).optional(),
  ollama: z.object({ baseUrl: optionalString }).optional(),
  lmStudio: z.object({ baseUrl: optionalString }).optional(),
});

const ModelPricingSchema = z.object({
  /** Cost in USD per 1M input (prompt) tokens. */
  costPerMInputTokens: z.number().nonnegative().optional(),
  /** Cost in USD per 1M output (completion) tokens. */
  costPerMOutputTokens: z.number().nonnegative().optional(),
});

const FallbackModelSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
  apiKey: optionalString,
  /** Token budget for conversation history when this model is active. */
  conversationHistoryTokenBudget: z.number().int().positive().optional(),
}).merge(ModelPricingSchema);

const CapableModelSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
}).merge(ModelPricingSchema);

const LlmConfigSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
  apiKey: optionalString,
  providers: ProviderOverridesSchema.optional(),
  fallbackModels: z.array(FallbackModelSchema).optional(),
  /** Stronger model used for tool-heavy / coding tasks. Omit to disable routing. */
  capableModel: CapableModelSchema.optional(),
  /** Token budget for conversation history. Overrides memory.conversationHistoryTokenBudget. */
  conversationHistoryTokenBudget: z.number().int().positive().optional(),
}).merge(ModelPricingSchema);

const ChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: optionalString,
  allowedUserIds: z.array(z.string()).optional(),
});

const SlackChannelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token: optionalString,            // Bot token (xoxb-)
  appToken: optionalString,         // App-level token (xapp-) for Socket Mode
  allowedUserIds: z.array(z.string()).optional(),
});

const ChannelsConfigSchema = z.object({
  telegram: ChannelConfigSchema.optional(),
  discord: ChannelConfigSchema.optional(),
  slack: SlackChannelConfigSchema.optional(),
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
  /** Default token budget for conversation history. Can be overridden per-model in llm config. */
  conversationHistoryTokenBudget: z.number().int().positive().default(40000),
});

const HeartbeatConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z.number().int().positive().default(1_800_000), // 30 min
  channelId: optionalString, // e.g., "telegram:12345"
});

const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  secret: optionalString, // HMAC-SHA256 secret for signature verification
  resultChannelId: optionalString, // e.g., "telegram:12345" — where to send results
});

const ServerConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("0.0.0.0"),
});

const ToolPolicySchema = z.enum(["auto-allow", "confirm", "deny"]);

const GovernanceConfigSchema = z.object({
  read: ToolPolicySchema.default("auto-allow"),
  write: ToolPolicySchema.default("confirm"),
  exec: ToolPolicySchema.default("confirm"),
  toolOverrides: z.record(z.string(), ToolPolicySchema).optional(),
});

const RateLimitWindowSchema = z.object({
  maxRequests: z.number().int().positive(),
  windowMs: z.number().int().positive(),
});

const RateLimitConfigSchema = z.object({
  channel: RateLimitWindowSchema.optional(),
  http: RateLimitWindowSchema.optional(),
  tool: RateLimitWindowSchema.optional(),
});

const SandboxLevelSchema = z.enum(["loose", "medium", "strict"]);

const SandboxConfigSchema = z.object({
  defaultLevel: SandboxLevelSchema.default("medium"),
  toolOverrides: z.record(z.string(), SandboxLevelSchema).optional(),
  dockerImage: z.string().default("alpine:3.19"),
  maxMemoryMb: z.number().int().positive().default(256),
  cpuCount: z.number().positive().default(0.5),
  allowNetwork: z.boolean().optional(),
});

const McpServerConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
  permission: ToolPermissionSchema.default("read"),
  toolPermissions: z.record(z.string(), ToolPermissionSchema).optional(),
  /** Capability group assigned to all tools from this server (e.g. "browser"). */
  group: z.string().optional(),
});

const McpConfigSchema = z.object({
  servers: z.array(McpServerConfigSchema).default([]),
});

const UserLinkSchema = z.object({
  id: z.string(),
  channels: z.array(z.string()),
});

const UsersConfigSchema = z.object({
  links: z.array(UserLinkSchema).default([]),
});

export const AppConfigSchema = z.object({
  llm: LlmConfigSchema,
  channels: ChannelsConfigSchema.optional(),
  agent: AgentConfigSchema,
  memory: MemoryConfigSchema,
  heartbeat: HeartbeatConfigSchema.optional(),
  webhook: WebhookConfigSchema.optional(),
  server: ServerConfigSchema,
  governance: GovernanceConfigSchema.optional(),
  rateLimit: RateLimitConfigSchema.optional(),
  sandbox: SandboxConfigSchema.optional(),
  mcp: McpConfigSchema.optional(),
  users: UsersConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type LlmProvider = z.infer<typeof LlmProviderSchema>;
export type SandboxLevel = z.infer<typeof SandboxLevelSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type UserLink = z.infer<typeof UserLinkSchema>;

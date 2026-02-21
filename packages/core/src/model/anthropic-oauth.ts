import { readFileSync } from "node:fs";
import { join } from "node:path";

interface AnthropicOauthEntry {
  type?: string;
  access?: unknown;
  expires?: unknown;
}

interface OpenCodeAuthStore {
  anthropic?: AnthropicOauthEntry;
  openai?: AnthropicOauthEntry;
}

export interface AnthropicOauthTokenOptions {
  authFilePath?: string;
  nowMs?: number;
  homeDir?: string;
}

function resolveDefaultAuthFilePath(homeDir = process.env.HOME): string | undefined {
  if (!homeDir) {
    return undefined;
  }

  return join(homeDir, ".local", "share", "opencode", "auth.json");
}

function readOpenCodeAuthStore(authFilePath: string): OpenCodeAuthStore | undefined {
  try {
    const raw = readFileSync(authFilePath, "utf-8");
    return JSON.parse(raw) as OpenCodeAuthStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function getAnthropicOauthAccessToken(
  options: AnthropicOauthTokenOptions = {},
): string | undefined {
  const nowMs = options.nowMs ?? Date.now();
  const authFilePath =
    options.authFilePath ?? process.env.ANTHROPIC_OAUTH_AUTH_FILE ?? resolveDefaultAuthFilePath(options.homeDir);

  if (!authFilePath) {
    return undefined;
  }

  const authStore = readOpenCodeAuthStore(authFilePath);
  const anthropic = authStore?.anthropic;

  if (!anthropic || anthropic.type !== "oauth") {
    return undefined;
  }

  if (typeof anthropic.expires === "number" && anthropic.expires <= nowMs) {
    return undefined;
  }

  if (typeof anthropic.access !== "string" || anthropic.access.length === 0) {
    return undefined;
  }

  return anthropic.access;
}

export function getOpenAIOauthAccessToken(options: AnthropicOauthTokenOptions = {}): string | undefined {
  const nowMs = options.nowMs ?? Date.now();
  const authFilePath =
    options.authFilePath ?? process.env.OPENAI_OAUTH_AUTH_FILE ?? resolveDefaultAuthFilePath(options.homeDir);

  if (!authFilePath) {
    return undefined;
  }

  const authStore = readOpenCodeAuthStore(authFilePath);
  const openai = authStore?.openai;

  if (!openai || openai.type !== "oauth") {
    return undefined;
  }

  if (typeof openai.expires === "number" && openai.expires <= nowMs) {
    return undefined;
  }

  if (typeof openai.access !== "string" || openai.access.length === 0) {
    return undefined;
  }

  return openai.access;
}

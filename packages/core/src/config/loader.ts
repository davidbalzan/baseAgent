import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { AppConfigSchema, type AppConfig } from "../schemas/config.schema.js";

function substituteEnvVars(text: string): string {
  return text.replace(/\$\{(\w+)\}/g, (_, varName: string) => {
    return process.env[varName] ?? "";
  });
}

export function loadConfig(configPath?: string): AppConfig {
  const filePath = configPath ?? resolve(process.cwd(), "config", "default.yaml");

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read config file: ${filePath}`, { cause: err });
  }

  const substituted = substituteEnvVars(raw);
  const parsed = parseYaml(substituted) as unknown;
  const result = AppConfigSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  return result.data;
}

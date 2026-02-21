import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolDefinition } from "@baseagent/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any>;
type RegisterToolFn = (tool: AnyToolDefinition) => void;

function isToolDefinition(obj: unknown): obj is AnyToolDefinition {
  if (typeof obj !== "object" || obj === null) return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t.name === "string" &&
    typeof t.description === "string" &&
    typeof t.parameters === "object" &&
    t.parameters !== null &&
    typeof t.execute === "function"
  );
}

export interface ReloadResult {
  registered: string[];
  failed: { name: string; error: string }[];
  requiresRestart: boolean;
}

/**
 * Scan the skills directory for new skills and register them.
 * Returns which skills were registered and whether a restart is needed.
 */
export async function reloadNewSkills(
  rootDir: string,
  registerTool: RegisterToolFn,
  changedFiles: string[],
): Promise<ReloadResult> {
  const registered: string[] = [];
  const failed: { name: string; error: string }[] = [];

  // Check if any changed files are new skills (skills/<name>/handler.ts)
  const newSkillDirs = new Set<string>();
  for (const file of changedFiles) {
    const match = file.match(/^skills\/([^/]+)\/handler\.ts$/);
    if (match) {
      newSkillDirs.add(match[1]);
    }
  }

  // Check if there are non-skill changes that require restart
  const hasPluginChanges = changedFiles.some(
    (f) => f.startsWith("packages/plugin-") || (f.startsWith("packages/") && !f.startsWith("packages/core/")),
  );
  const hasNonSkillChanges = changedFiles.some(
    (f) => !f.startsWith("skills/"),
  );
  const requiresRestart = hasPluginChanges || (hasNonSkillChanges && newSkillDirs.size === 0);

  // Try to hot-reload new skills
  const skillsDir = join(rootDir, "skills");
  if (!existsSync(skillsDir)) {
    return { registered, failed, requiresRestart };
  }

  for (const skillName of newSkillDirs) {
    const handlerPath = join(skillsDir, skillName, "handler.ts");
    if (!existsSync(handlerPath) || !statSync(join(skillsDir, skillName)).isDirectory()) {
      continue;
    }

    try {
      // Cache-bust ESM module cache with timestamp query
      const moduleUrl = pathToFileURL(handlerPath).href + `?t=${Date.now()}`;
      const mod = await import(moduleUrl);
      const exported = mod.default;

      if (!exported) {
        failed.push({ name: skillName, error: "No default export" });
        continue;
      }

      const tool = typeof exported === "function" ? exported({}) : exported;

      if (!isToolDefinition(tool)) {
        failed.push({ name: skillName, error: "Export is not a valid ToolDefinition" });
        continue;
      }

      try {
        registerTool(tool);
        registered.push(tool.name);
      } catch (err) {
        // Likely duplicate — skip
        failed.push({
          name: skillName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } catch (err) {
      failed.push({
        name: skillName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { registered, failed, requiresRestart };
}

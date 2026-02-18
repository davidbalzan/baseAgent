import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolDefinition } from "@baseagent/core";

export interface SkillContext {
  workspacePath: string;
}

export interface LoadSkillsResult {
  tools: ToolDefinition[];
  loaded: string[];
  failed: { name: string; error: string }[];
}

function isToolDefinition(obj: unknown): obj is ToolDefinition {
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

/**
 * Discover and load tool definitions from a skills directory.
 *
 * Convention: `<skillsDir>/<name>/handler.ts` default-exporting
 * either a ToolDefinition or a factory `(ctx) => ToolDefinition`.
 *
 * Each skill is loaded independently — failures don't crash startup.
 */
export async function loadSkills(
  skillsDir: string,
  context?: SkillContext,
): Promise<LoadSkillsResult> {
  const tools: ToolDefinition[] = [];
  const loaded: string[] = [];
  const failed: { name: string; error: string }[] = [];

  if (!existsSync(skillsDir)) {
    return { tools, loaded, failed };
  }

  const entries = readdirSync(skillsDir);

  for (const entry of entries) {
    // Skip hidden, private, and infrastructure directories
    if (entry.startsWith(".") || entry.startsWith("_") || entry === "node_modules") continue;

    const entryPath = join(skillsDir, entry);
    if (!statSync(entryPath).isDirectory()) continue;
    // Skip dirs without handler (silently — only report if handler exists but is broken)
    if (!existsSync(join(entryPath, "handler.ts"))) continue;

    const handlerPath = join(entryPath, "handler.ts");

    try {
      const moduleUrl = pathToFileURL(handlerPath).href;
      const mod = await import(moduleUrl);
      const exported = mod.default;

      if (!exported) {
        failed.push({ name: entry, error: "No default export" });
        continue;
      }

      let tool: unknown;

      if (typeof exported === "function") {
        // Factory function — pass context
        tool = exported(context ?? {});
      } else {
        // Direct ToolDefinition object
        tool = exported;
      }

      if (!isToolDefinition(tool)) {
        failed.push({
          name: entry,
          error: "Export is not a valid ToolDefinition (missing name, description, parameters, or execute)",
        });
        continue;
      }

      tools.push(tool);
      loaded.push(tool.name);
    } catch (err) {
      failed.push({
        name: entry,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { tools, loaded, failed };
}

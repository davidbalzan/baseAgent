import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

/**
 * Capability groups that are only included when the user's input signals intent.
 * Tools without a group, or whose group is not listed here, are always included.
 *
 * Add new entries here as new conditional MCP servers are registered.
 */
const CONDITIONAL_GROUPS: Record<string, string[]> = {
  browser: [
    "browser", "website", "webpage", "web page", "navigate", "navigation",
    "screenshot", "click", "scroll", "tab", "chrome", "devtools",
    "search", "google", "news", "headline", "article",
    "visit", "open", "page", "link", "form", "type into",
    "check", "look up", "find out", "what is", "what's", "current",
    "today", "latest", "now", "live",
  ],
};

export interface ToolSelectionResult {
  tools: Record<string, ToolDefinition>;
  totalCount: number;
  selectedCount: number;
  activeGroups: string[];
}

/**
 * Load additional conditional groups from workspace/tool-groups.json.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
function loadCustomGroups(workspacePath: string): Record<string, string[]> {
  try {
    const raw = readFileSync(resolve(workspacePath, "tool-groups.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Filter the full tool registry down to only what is likely needed for this input.
 *
 * Rules:
 * - Tools with no group are always included (all built-ins).
 * - Tools in a conditional group are only included when the input contains
 *   a keyword that signals intent for that group.
 * - If no conditional groups are triggered, only ungrouped tools are sent —
 *   saving significant prompt tokens on every iteration.
 *
 * Custom groups from workspace/tool-groups.json are merged with the hardcoded
 * groups, allowing agents to register new groups at runtime via register_tool_group.
 */
export function selectTools(
  input: string,
  allTools: Record<string, ToolDefinition>,
  workspacePath?: string,
): ToolSelectionResult {
  const lower = input.toLowerCase();
  const totalCount = Object.keys(allTools).length;

  // Merge hardcoded groups with any custom groups from disk
  const customGroups = workspacePath ? loadCustomGroups(workspacePath) : {};
  const allGroups: Record<string, string[]> = { ...CONDITIONAL_GROUPS, ...customGroups };

  const activeGroups: string[] = [];
  for (const [group, keywords] of Object.entries(allGroups)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      activeGroups.push(group);
    }
  }

  const tools: Record<string, ToolDefinition> = {};
  for (const [name, tool] of Object.entries(allTools)) {
    const group = tool.group;
    if (!group || !allGroups[group] || activeGroups.includes(group)) {
      tools[name] = tool;
    }
  }

  return { tools, totalCount, selectedCount: Object.keys(tools).length, activeGroups };
}

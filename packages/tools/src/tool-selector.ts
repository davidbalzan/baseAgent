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
  ],
};

export interface ToolSelectionResult {
  tools: Record<string, ToolDefinition>;
  totalCount: number;
  selectedCount: number;
  activeGroups: string[];
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
 */
export function selectTools(
  input: string,
  allTools: Record<string, ToolDefinition>,
): ToolSelectionResult {
  const lower = input.toLowerCase();
  const totalCount = Object.keys(allTools).length;

  const activeGroups: string[] = [];
  for (const [group, keywords] of Object.entries(CONDITIONAL_GROUPS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      activeGroups.push(group);
    }
  }

  const tools: Record<string, ToolDefinition> = {};
  for (const [name, tool] of Object.entries(allTools)) {
    const group = tool.group;
    if (!group || !CONDITIONAL_GROUPS[group] || activeGroups.includes(group)) {
      tools[name] = tool;
    }
  }

  return { tools, totalCount, selectedCount: Object.keys(tools).length, activeGroups };
}

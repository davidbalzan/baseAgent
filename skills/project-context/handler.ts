import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const DOCS = ["PRD.md", "DECISIONS.md", "PRODUCTION_ROADMAP.md"] as const;

const parameters = z.object({
  document: z
    .enum(DOCS)
    .describe("Which project document to read: PRD.md, DECISIONS.md, or PRODUCTION_ROADMAP.md"),
  section: z
    .string()
    .optional()
    .describe("Optional heading to search for. Returns only that section if found."),
});

interface SkillContext {
  workspacePath: string;
}

function extractSection(content: string, heading: string): string | null {
  const lines = content.split("\n");
  const pattern = heading.toLowerCase();
  let startIdx = -1;
  let startLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)/);
    if (match && match[2].toLowerCase().includes(pattern)) {
      startIdx = i;
      startLevel = match[1].length;
      break;
    }
  }

  if (startIdx === -1) return null;

  // Collect until next heading of same or higher level
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= startLevel) {
      endIdx = i;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join("\n").trim();
}

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  const docsDir = join(ctx.workspacePath, "..", "docs");

  return {
    name: "project_context",
    description:
      "Read project documentation (PRD, architectural decisions, production roadmap). Optionally extract a specific section by heading.",
    parameters,
    timeoutMs: 5_000,
    maxOutputChars: 40_000,
    execute: async (args) => {
      const filePath = join(docsDir, args.document);

      if (!existsSync(filePath)) {
        return `Document ${args.document} not found. Available docs are in the docs/ directory.`;
      }

      const content = readFileSync(filePath, "utf-8");

      if (args.section) {
        const section = extractSection(content, args.section);
        if (!section) {
          return `Section "${args.section}" not found in ${args.document}.`;
        }
        return `[${args.document} → ${args.section}]\n\n${section}`;
      }

      return `[${args.document}]\n\n${content}`;
    },
  };
}

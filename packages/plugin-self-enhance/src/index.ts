import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, PluginCapabilities, PluginContext, ToolDefinition } from "@baseagent/core";
import {
  getSession,
  setSession,
  requireSession,
  requireNoSession,
  type EnhanceSession,
} from "./enhance-session.js";
import {
  createWorktree,
  commitWorktreeChanges,
  getChangedFiles,
  assertNoProtectedChanges,
  mergeWorktree,
  cleanupWorktree,
} from "./git-ops.js";
import { runTests } from "./container.js";
import { reloadNewSkills } from "./skill-reload.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = resolve(__dirname, "..");

export interface SelfEnhanceConfig {
  /** Run tests inside a Docker container for isolation. Default: false. */
  useDocker?: boolean;
}

// --- Zod schemas for discriminated union ---

const StartSchema = z.object({
  action: z.literal("start"),
  description: z.string().min(1).describe("Short description of the enhancement"),
});

const WriteFileSchema = z.object({
  action: z.literal("write_file"),
  path: z.string().min(1).describe("File path relative to repo root"),
  content: z.string().describe("File content to write"),
  append: z.boolean().optional().describe("Append instead of overwrite"),
});

const ReadFileSchema = z.object({
  action: z.literal("read_file"),
  path: z.string().min(1).describe("File path relative to repo root"),
  offset: z.number().int().min(0).optional().describe("Line offset to start reading from"),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to read"),
});

const EditFileSchema = z.object({
  action: z.literal("edit_file"),
  path: z.string().min(1).describe("File path relative to repo root"),
  old_string: z.string().min(1).describe("Exact string to find (must match exactly once)"),
  new_string: z.string().describe("Replacement string"),
});

const ListFilesSchema = z.object({
  action: z.literal("list_files"),
  path: z.string().optional().describe("Directory path relative to repo root (default: root)"),
  recursive: z.boolean().optional().describe("List recursively"),
});

const TestSchema = z.object({
  action: z.literal("test"),
  command: z.string().optional().describe("Custom test command (default: pnpm install + typecheck + test)"),
});

const ApplySchema = z.object({
  action: z.literal("apply"),
  commitMessage: z.string().optional().describe("Custom commit message"),
});

const AbortSchema = z.object({
  action: z.literal("abort"),
});

const SelfEnhanceSchema = z.discriminatedUnion("action", [
  StartSchema,
  WriteFileSchema,
  ReadFileSchema,
  EditFileSchema,
  ListFilesSchema,
  TestSchema,
  ApplySchema,
  AbortSchema,
]);

type SelfEnhanceArgs = z.infer<typeof SelfEnhanceSchema>;

// --- Action handlers ---

async function handleStart(args: z.infer<typeof StartSchema>, rootDir: string): Promise<string> {
  requireNoSession();

  const { worktreePath, branch } = await createWorktree(rootDir, args.description);

  const session: EnhanceSession = {
    worktreePath,
    branch,
    description: args.description,
    lastTestPassed: false,
    createdAt: Date.now(),
  };
  setSession(session);

  return [
    `Enhancement session started.`,
    `Branch: ${branch}`,
    `Worktree: ${worktreePath}`,
    ``,
    `You can now write/edit/read files in the worktree.`,
    `All paths are relative to the repo root (e.g. "skills/weather/handler.ts").`,
    ``,
    `Workflow: write_file/edit_file -> test -> apply (or abort)`,
    ``,
    `Protected paths (apply will block): packages/core/`,
    ``,
    `Documentation:`,
    `  - Skills guide: docs/CAPABILITIES.md (section 4: Skills System)`,
    `  - Plugin guide: docs/PLUGINS.md`,
    `  - Existing skills for reference: skills/echo/handler.ts`,
  ].join("\n");
}

function handleWriteFile(args: z.infer<typeof WriteFileSchema>): string {
  const session = requireSession();
  const fullPath = join(session.worktreePath, args.path);

  // Ensure parent directory exists
  const dir = dirname(fullPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (args.append && existsSync(fullPath)) {
    const existing = readFileSync(fullPath, "utf-8");
    writeFileSync(fullPath, existing + args.content, "utf-8");
  } else {
    writeFileSync(fullPath, args.content, "utf-8");
  }

  return `Wrote ${args.path} (${args.content.length} chars${args.append ? ", appended" : ""})`;
}

function handleReadFile(args: z.infer<typeof ReadFileSchema>): string {
  const session = requireSession();
  const fullPath = join(session.worktreePath, args.path);

  if (!existsSync(fullPath)) {
    return `File not found: ${args.path}`;
  }

  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  const offset = args.offset ?? 0;
  const limit = args.limit ?? lines.length;
  const sliced = lines.slice(offset, offset + limit);

  // Format with line numbers like the built-in Read tool
  const numbered = sliced.map((line, i) => `${String(offset + i + 1).padStart(6)}\t${line}`);
  return numbered.join("\n");
}

function handleEditFile(args: z.infer<typeof EditFileSchema>): string {
  const session = requireSession();
  const fullPath = join(session.worktreePath, args.path);

  if (!existsSync(fullPath)) {
    return `File not found: ${args.path}`;
  }

  const content = readFileSync(fullPath, "utf-8");
  const count = content.split(args.old_string).length - 1;

  if (count === 0) {
    return `old_string not found in ${args.path}. Make sure it matches exactly.`;
  }
  if (count > 1) {
    return `old_string found ${count} times in ${args.path}. Must match exactly once. Add more context.`;
  }

  const updated = content.replace(args.old_string, args.new_string);
  writeFileSync(fullPath, updated, "utf-8");
  return `Edited ${args.path} (replaced 1 occurrence)`;
}

function handleListFiles(args: z.infer<typeof ListFilesSchema>): string {
  const session = requireSession();
  const targetDir = args.path ? join(session.worktreePath, args.path) : session.worktreePath;

  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    return `Directory not found: ${args.path ?? "/"}`;
  }

  const results: string[] = [];

  function walk(dir: string, prefix: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules") continue;
      const fullPath = join(dir, entry);
      const relativePath = prefix ? `${prefix}/${entry}` : entry;
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(`${relativePath}/`);
        if (args.recursive) {
          walk(fullPath, relativePath);
        }
      } else {
        results.push(relativePath);
      }
    }
  }

  walk(targetDir, "");
  return results.length > 0 ? results.join("\n") : "(empty directory)";
}

async function handleTest(
  args: z.infer<typeof TestSchema>,
  log: (msg: string) => void,
  useDocker: boolean,
): Promise<string> {
  const session = requireSession();

  const result = await runTests(
    session.worktreePath,
    { useDocker, pluginDir: PLUGIN_DIR, command: args.command },
    log,
  );

  // Update session test status
  session.lastTestPassed = result.passed;

  const status = result.passed ? "PASSED" : "FAILED";
  return [
    `Test result: ${status} (exit code: ${result.exitCode})`,
    ``,
    result.output,
  ].join("\n");
}

async function handleApply(
  args: z.infer<typeof ApplySchema>,
  rootDir: string,
  registerTool: (tool: ToolDefinition) => void,
  log: (msg: string) => void,
): Promise<string> {
  const session = requireSession();

  if (!session.lastTestPassed) {
    return "Cannot apply: last test run did not pass. Run tests successfully before applying.";
  }

  // Check for protected path violations
  const changedFiles = await getChangedFiles(session.worktreePath);
  if (changedFiles.length === 0) {
    return "No changes to apply.";
  }

  assertNoProtectedChanges(changedFiles);

  // Commit in worktree
  const message = args.commitMessage ?? `feat: ${session.description}`;
  await commitWorktreeChanges(session.worktreePath, message);

  // Merge into current branch
  log("Merging changes into current branch...");
  await mergeWorktree(rootDir, session.branch, message);

  // Hot-reload new skills
  const reload = await reloadNewSkills(rootDir, registerTool, changedFiles);

  // Cleanup
  await cleanupWorktree(rootDir, session.worktreePath, session.branch);
  setSession(null);

  // Build result message
  const lines = [
    `Enhancement applied successfully.`,
    `Commit: ${message}`,
    `Changed files: ${changedFiles.length}`,
    ``,
    `Files:`,
    ...changedFiles.map((f) => `  - ${f}`),
  ];

  if (reload.registered.length > 0) {
    lines.push(``, `Hot-reloaded skills: ${reload.registered.join(", ")}`);
  }
  if (reload.failed.length > 0) {
    lines.push(``, `Failed to reload:`);
    for (const f of reload.failed) {
      lines.push(`  - ${f.name}: ${f.error}`);
    }
  }

  if (reload.requiresRestart) {
    lines.push(``, `NOTE: Changes include plugins or package modifications. A restart is needed for full effect.`);
  } else {
    lines.push(``, `No restart needed — new skills are immediately available.`);
  }

  return lines.join("\n");
}

async function handleAbort(rootDir: string): Promise<string> {
  const session = requireSession();
  await cleanupWorktree(rootDir, session.worktreePath, session.branch);
  setSession(null);
  return "Enhancement session aborted. Worktree and branch cleaned up.";
}

// --- Plugin factory ---

export function createSelfEnhancePlugin(config?: SelfEnhanceConfig): Plugin {
  const useDocker = config?.useDocker ?? false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capturedRegisterTool: ((tool: ToolDefinition<any>) => void) | null = null;

  return {
    name: "self-enhance",
    phase: "tools",

    async init(ctx: PluginContext): Promise<PluginCapabilities> {
      capturedRegisterTool = ctx.registerTool;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tool: ToolDefinition<any> = {
        name: "self_enhance",
        description: [
          "Self-modify the agent's codebase safely. Creates an isolated git worktree,",
          "lets you write/edit files, validates (typecheck + tests), and merges on success.",
          "Use for creating new skills or plugins.",
          "Preferred path for multi-file or cross-package enhancements.",
          "Follow deterministic runbook only: start -> edits -> test -> apply|abort.",
          "Read docs/CAPABILITIES.md (section 4) for skills and docs/PLUGINS.md for plugins.",
          "Cannot touch packages/core/ (protected).",
          "",
          "Workflow: start -> write_file/edit_file -> test -> apply (or abort)",
        ].join(" "),
        parameters: SelfEnhanceSchema,
        permission: "exec",
        group: "development",

        async execute(args: SelfEnhanceArgs): Promise<string> {
          try {
            switch (args.action) {
              case "start":
                return await handleStart(args, ctx.rootDir);
              case "write_file":
                return handleWriteFile(args);
              case "read_file":
                return handleReadFile(args);
              case "edit_file":
                return handleEditFile(args);
              case "list_files":
                return handleListFiles(args);
              case "test":
                return await handleTest(args, ctx.log, useDocker);
              case "apply":
                return await handleApply(args, ctx.rootDir, ctx.registerTool, ctx.log);
              case "abort":
                return await handleAbort(ctx.rootDir);
              default:
                return `Unknown action: ${(args as { action: string }).action}`;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return `[self_enhance error] ${msg}`;
          }
        },
      };

      ctx.log("Plugin enabled");
      return {
        tools: [tool],
        docs: [{
          title: "Self-Enhance",
          filename: "SELF_ENHANCE.md",
          content: [
            "# Self-Enhance Plugin",
            "",
            "Allows the agent to safely modify its own codebase — creating new skills, editing files, running tests, and merging changes — all in an isolated git worktree.",
            "",
            "## Tool: `self_enhance`",
            "",
            "A multi-action tool (`permission: exec`) with the following actions:",
            "",
            "| Action | Description |",
            "|--------|-------------|",
            "| `start` | Create an isolated worktree and begin an enhancement session |",
            "| `write_file` | Write or append to a file in the worktree |",
            "| `read_file` | Read a file from the worktree |",
            "| `edit_file` | Exact-string-replace edit in the worktree |",
            "| `list_files` | List files in a worktree directory |",
            "| `test` | Run typecheck + tests (optionally in Docker) |",
            "| `apply` | Commit and merge changes into the current branch |",
            "| `abort` | Discard all changes and clean up the worktree |",
            "",
            "## Workflow",
            "",
            "1. `start` — Creates a git worktree on a temporary branch",
            "2. `write_file` / `edit_file` — Make changes in isolation",
            "3. `test` — Validate with `pnpm install && typecheck && test`",
            "4. `apply` — Merge into main branch (requires tests to pass first)",
            "",
            "If anything goes wrong, `abort` cleans up the worktree and branch.",
            "",
            "## Safety",
            "",
            "- **Protected paths**: Changes to `packages/core/` are blocked on apply",
            "- **Test gate**: `apply` refuses if the last test run did not pass",
            "- **Isolation**: All changes happen in a separate worktree — main branch is untouched until merge",
            "- **Skill hot-reload**: New skills created via `apply` are automatically hot-reloaded",
            "",
            "## Configuration",
            "",
            "| Option | Default | Description |",
            "|--------|---------|-------------|",
            "| `useDocker` | `false` | Run tests inside a Docker container for additional isolation |",
          ].join("\n"),
        }],
      };
    },

    async shutdown(): Promise<void> {
      // Clean up any active session on shutdown
      const session = getSession();
      if (session) {
        try {
          // Best-effort cleanup — rootDir not available in shutdown,
          // but we can at least clear the state
          setSession(null);
        } catch {
          // Ignore errors during shutdown
        }
      }
    },
  };
}

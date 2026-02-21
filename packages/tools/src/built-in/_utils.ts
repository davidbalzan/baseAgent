import { resolve, normalize, sep, basename } from "node:path";
import { realpathSync, lstatSync } from "node:fs";

/**
 * Path scope — determines which root a path is resolved against.
 * - `"workspace"` → `workspace/` directory (read+write, default)
 * - `"project"`   → repo root directory (read-only for file tools)
 */
export type PathScope = "workspace" | "project";

/**
 * Result of parsing a user-supplied path that may include a `project:` prefix.
 */
export interface ScopedPath {
  scope: PathScope;
  /** Path with prefix stripped. */
  relativePath: string;
}

/**
 * Parse a user path for an optional `project:` prefix.
 * - `"project:packages/core/src/index.ts"` → `{ scope: "project", relativePath: "packages/core/src/index.ts" }`
 * - `"foo.txt"` → `{ scope: "workspace", relativePath: "foo.txt" }`
 */
export function parseScopedPath(userPath: string): ScopedPath {
  if (userPath.startsWith("project:")) {
    return { scope: "project", relativePath: userPath.slice("project:".length) };
  }
  return { scope: "workspace", relativePath: userPath };
}

/**
 * Resolve a path against a given root directory with sandbox enforcement.
 * Ensures the resolved path cannot escape via traversal (../) or symlinks.
 * Returns the resolved absolute path or throws.
 */
function resolveSandboxedPath(rootDir: string, userPath: string, scopeLabel: string): string {
  // Reject absolute paths — force everything relative to root
  if (userPath.startsWith("/") || userPath.startsWith("\\")) {
    throw new Error(`Access denied: absolute paths are not allowed ("${userPath}")`);
  }

  const resolved = normalize(resolve(rootDir, userPath));
  const rootPrefix = normalize(rootDir) + sep;

  // Allow exact root or anything under it
  if (resolved !== normalize(rootDir) && !resolved.startsWith(rootPrefix)) {
    throw new Error(`Access denied: path escapes ${scopeLabel} ("${userPath}")`);
  }

  // Check symlink targets don't escape
  try {
    const stat = lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(resolved);
      if (!real.startsWith(rootPrefix) && real !== normalize(rootDir)) {
        throw new Error(`Access denied: symlink target escapes ${scopeLabel} ("${userPath}")`);
      }
    }
  } catch (err) {
    // File doesn't exist yet — that's fine for write operations
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }

  return resolved;
}

/**
 * Resolve a user-supplied path against the workspace root,
 * ensuring it cannot escape via traversal (../) or symlinks.
 * Returns the resolved absolute path or throws.
 */
export function resolveWorkspacePath(
  workspacePath: string,
  userPath: string,
): string {
  return resolveSandboxedPath(workspacePath, userPath, "workspace");
}

/**
 * Resolve a user-supplied path against the project (repo) root,
 * ensuring it cannot escape via traversal (../) or symlinks.
 * Returns the resolved absolute path or throws.
 */
export function resolveProjectPath(
  projectRootPath: string,
  userPath: string,
): string {
  return resolveSandboxedPath(projectRootPath, userPath, "project");
}

/**
 * Resolve a scoped path (with optional `project:` prefix) against the appropriate root.
 * If `projectRootPath` is undefined and a project scope is requested, throws.
 */
export function resolveScopedPath(
  workspacePath: string,
  projectRootPath: string | undefined,
  userPath: string,
): { resolved: string; scope: PathScope } {
  const { scope, relativePath } = parseScopedPath(userPath);
  if (scope === "project") {
    if (!projectRootPath) {
      throw new Error("Access denied: project root not configured — project: prefix is not available.");
    }
    return { resolved: resolveProjectPath(projectRootPath, relativePath), scope };
  }
  return { resolved: resolveWorkspacePath(workspacePath, relativePath), scope };
}

/**
 * Memory files managed exclusively through the `memory_write` tool.
 * `file_write` and `file_edit` must not touch these — protecting them from
 * accidental overwrite or deletion by the agent (MM-6).
 *
 * - MEMORY.md / USER.md       → append-only via memory_write
 * - SOUL.md / PERSONALITY.md / HEARTBEAT.md → user-managed, agent read-only
 */
export const PROTECTED_MEMORY_FILES = new Set([
  "SOUL.md",
  "PERSONALITY.md",
  "USER.md",
  "MEMORY.md",
  "HEARTBEAT.md",
]);

/**
 * Throws if `resolvedPath` points to a protected memory file.
 * Call this in any file tool that writes or edits content.
 */
export function assertNotProtectedMemoryFile(resolvedPath: string): void {
  const name = basename(resolvedPath);
  if (PROTECTED_MEMORY_FILES.has(name)) {
    const hint = name === "HEARTBEAT.md"
      ? "Use heartbeat_register to add schedule tasks."
      : "Use memory_write to append new entries.";
    throw new Error(
      `"${name}" is a protected memory file and cannot be modified via file tools. ` +
      hint,
    );
  }
}

/** Env vars safe to pass through to child processes. */
const ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TERM",
  "USER",
  "SHELL",
  "TMPDIR",
  "NODE_ENV",
]);

/**
 * Build a filtered copy of process.env containing only
 * safe vars — no API keys or tokens leak to child processes.
 */
export function createSafeEnv(): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key]!;
    }
  }
  return safe;
}

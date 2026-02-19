import { resolve, normalize, sep, basename } from "node:path";
import { realpathSync, lstatSync } from "node:fs";

/**
 * Resolve a user-supplied path against the workspace root,
 * ensuring it cannot escape via traversal (../) or symlinks.
 * Returns the resolved absolute path or throws.
 */
export function resolveWorkspacePath(
  workspacePath: string,
  userPath: string,
): string {
  // Reject absolute paths — force everything relative to workspace
  if (userPath.startsWith("/") || userPath.startsWith("\\")) {
    throw new Error(`Access denied: absolute paths are not allowed ("${userPath}")`);
  }

  const resolved = normalize(resolve(workspacePath, userPath));
  const workspacePrefix = normalize(workspacePath) + sep;

  // Allow exact workspace root or anything under it
  if (resolved !== normalize(workspacePath) && !resolved.startsWith(workspacePrefix)) {
    throw new Error(`Access denied: path escapes workspace ("${userPath}")`);
  }

  // Check symlink targets don't escape
  try {
    const stat = lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      const real = realpathSync(resolved);
      if (!real.startsWith(workspacePrefix) && real !== normalize(workspacePath)) {
        throw new Error(`Access denied: symlink target escapes workspace ("${userPath}")`);
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
    throw new Error(
      `"${name}" is a protected memory file and cannot be modified via file tools. ` +
      `Use memory_write to append new entries.`,
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
